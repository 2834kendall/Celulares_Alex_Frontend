"""Exporta MobileFaceNet a ONNX para el kiosco (embeddings de 128 dim).

Por que este script y no un .onnx descargado de un repo cualquiera: este es
un sistema de identificacion de personas — el vector que produce el modelo
es literalmente el dato que decide "es este empleado o no". No hay una
fuente "oficial" unica de MobileFaceNet en ONNX (son conversiones de
comunidad de procedencia variable), asi que en vez de confiar en un binario
de terceros sin poder auditarlo, este script construye la arquitectura
localmente (la MobileFaceNet original de Chen et al. 2018, la misma
estructura que replican casi todas las implementaciones publicas) y la
exporta a partir de PESOS QUE TU ELIGES Y APORTAS — nunca descarga nada por
su cuenta.

Uso:
    pip install torch onnx onnxruntime numpy
    python scripts/export_mobilefacenet.py --weights /ruta/a/tus_pesos.pth

De donde sacar los pesos: cualquier checkpoint de MobileFaceNet entrenado
para reconocimiento facial (112x112, embedding 128d) cuya procedencia puedas
verificar tu mismo — por ejemplo, entrenando el modelo con tu propio pipeline,
o un checkpoint de un repositorio academico/institucional que revises antes
de usar. Este script asume las claves de state_dict de la implementacion
estandar de MobileFaceNet (conv1/conv2_dw/blocks.../conv_6_dw/conv_6_flatten/
linear/bn); si tus pesos vienen de una variante con nombres distintos, ajusta
`MobileFaceNet.load_state_dict` a un mapeo de claves, o el `strict=True` de
mas abajo fallara con un mensaje claro en vez de cargar pesos a medias.

Salida: public/models/mobilefacenet.onnx — input float32[1,3,112,112]
(NCHW, normalizado (x-127.5)/128, igual que
src/modules/attendance/components/kiosk/face/preprocess.ts), output
float32[1,128]. El script verifica ambas cosas antes de terminar.
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

EMBEDDING_DIM = 128
INPUT_SIZE = 112


class ConvBlock(nn.Module):
    def __init__(self, in_c, out_c, kernel=(1, 1), stride=(1, 1), padding=(0, 0), groups=1, linear=False):
        super().__init__()
        self.linear = linear
        self.conv = nn.Conv2d(in_c, out_c, kernel, stride, padding, groups=groups, bias=False)
        self.bn = nn.BatchNorm2d(out_c)
        if not linear:
            self.prelu = nn.PReLU(out_c)

    def forward(self, x):
        x = self.conv(x)
        x = self.bn(x)
        if not self.linear:
            x = self.prelu(x)
        return x


class DepthWise(nn.Module):
    """Bottleneck invertido (expand -> depthwise -> project) con residual opcional."""

    def __init__(self, in_c, out_c, residual=False, kernel=(3, 3), stride=(2, 2), padding=(1, 1), groups=1):
        super().__init__()
        self.residual = residual
        self.conv = ConvBlock(in_c, groups, kernel=(1, 1), padding=(0, 0), stride=(1, 1))
        self.conv_dw = ConvBlock(groups, groups, kernel, stride, padding, groups=groups)
        self.project = ConvBlock(groups, out_c, kernel=(1, 1), padding=(0, 0), stride=(1, 1), linear=True)

    def forward(self, x):
        short_cut = x
        x = self.conv(x)
        x = self.conv_dw(x)
        x = self.project(x)
        if self.residual:
            x = short_cut + x
        return x


class Residual(nn.Module):
    def __init__(self, c, num_block, groups, kernel=(3, 3), stride=(1, 1), padding=(1, 1)):
        super().__init__()
        self.model = nn.Sequential(
            *[
                DepthWise(c, c, residual=True, kernel=kernel, stride=stride, padding=padding, groups=groups)
                for _ in range(num_block)
            ]
        )

    def forward(self, x):
        return self.model(x)


class MobileFaceNet(nn.Module):
    """Arquitectura estandar de MobileFaceNet (Chen et al., 2018): entrada
    112x112x3, salida un embedding de 128 dimensiones (sin normalizar — la
    normalizacion L2 la hace el cliente en faceMath.l2Normalize, igual que
    con el vector de enrolamiento)."""

    def __init__(self, embedding_dim=EMBEDDING_DIM):
        super().__init__()
        self.conv1 = ConvBlock(3, 64, kernel=(3, 3), stride=(2, 2), padding=(1, 1))
        self.conv2_dw = ConvBlock(64, 64, kernel=(3, 3), stride=(1, 1), padding=(1, 1), groups=64)
        self.conv_23 = DepthWise(64, 64, kernel=(3, 3), stride=(2, 2), padding=(1, 1), groups=128)
        self.conv_3 = Residual(64, num_block=4, groups=128, kernel=(3, 3), stride=(1, 1), padding=(1, 1))
        self.conv_34 = DepthWise(64, 128, kernel=(3, 3), stride=(2, 2), padding=(1, 1), groups=256)
        self.conv_4 = Residual(128, num_block=6, groups=256, kernel=(3, 3), stride=(1, 1), padding=(1, 1))
        self.conv_45 = DepthWise(128, 128, kernel=(3, 3), stride=(2, 2), padding=(1, 1), groups=512)
        self.conv_5 = Residual(128, num_block=2, groups=256, kernel=(3, 3), stride=(1, 1), padding=(1, 1))
        self.conv_6_sep = ConvBlock(128, 512, kernel=(1, 1), stride=(1, 1), padding=(0, 0))
        # Global depthwise conv (GDConv): reemplaza al average pooling global,
        # el detalle distintivo de MobileFaceNet frente a un MobileNet generico.
        self.conv_6_dw = ConvBlock(512, 512, kernel=(7, 7), stride=(1, 1), padding=(0, 0), groups=512, linear=True)
        self.conv_6_flatten = nn.Flatten()
        self.linear = nn.Linear(512, embedding_dim, bias=False)
        self.bn = nn.BatchNorm1d(embedding_dim)

    def forward(self, x):
        x = self.conv1(x)
        x = self.conv2_dw(x)
        x = self.conv_23(x)
        x = self.conv_3(x)
        x = self.conv_34(x)
        x = self.conv_4(x)
        x = self.conv_45(x)
        x = self.conv_5(x)
        x = self.conv_6_sep(x)
        x = self.conv_6_dw(x)
        x = self.conv_6_flatten(x)
        x = self.linear(x)
        x = self.bn(x)
        return x


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--weights", required=True, help="Ruta local a un state_dict (.pth) de MobileFaceNet.")
    parser.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parent.parent / "public" / "models" / "mobilefacenet.onnx"),
        help="Ruta de salida del .onnx (default: public/models/mobilefacenet.onnx).",
    )
    parser.add_argument("--opset", type=int, default=12, help="Opset ONNX (default 12, compatible con onnxruntime-web).")
    args = parser.parse_args()

    weights_path = Path(args.weights)
    if not weights_path.exists():
        print(f"No existe el archivo de pesos: {weights_path}", file=sys.stderr)
        return 1

    model = MobileFaceNet()
    state_dict = torch.load(weights_path, map_location="cpu")
    if isinstance(state_dict, dict) and "state_dict" in state_dict:
        state_dict = state_dict["state_dict"]

    # strict=True a proposito: si las claves no calzan, mejor un error claro
    # aca que un modelo silenciosamente mal cargado sirviendo autenticacion.
    model.load_state_dict(state_dict, strict=True)
    model.eval()

    dummy = torch.randn(1, 3, INPUT_SIZE, INPUT_SIZE, dtype=torch.float32)

    with torch.no_grad():
        torch_output = model(dummy)

    if torch_output.shape != (1, EMBEDDING_DIM):
        print(
            f"El modelo produjo salida {tuple(torch_output.shape)}, se esperaba (1, {EMBEDDING_DIM}). "
            "Revisa la arquitectura o el argumento --weights.",
            file=sys.stderr,
        )
        return 1

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    torch.onnx.export(
        model,
        dummy,
        str(output_path),
        input_names=["input"],
        output_names=["embedding"],
        opset_version=args.opset,
        do_constant_folding=True,
    )

    # Verificacion cruzada: el .onnx exportado debe reproducir la misma
    # salida que el modelo de PyTorch, no solo "tener la forma correcta".
    import onnx
    import onnxruntime as ort

    onnx_model = onnx.load(str(output_path))
    onnx.checker.check_model(onnx_model)

    session = ort.InferenceSession(str(output_path), providers=["CPUExecutionProvider"])
    onnx_output = session.run(None, {"input": dummy.numpy()})[0]

    if onnx_output.shape != (1, EMBEDDING_DIM):
        print(f"El .onnx exportado tiene salida {onnx_output.shape}, se esperaba (1, {EMBEDDING_DIM}).", file=sys.stderr)
        return 1

    max_diff = float(np.max(np.abs(onnx_output - torch_output.numpy())))
    print(f"Diferencia maxima PyTorch vs ONNX: {max_diff:.2e}")
    if max_diff > 1e-4:
        print("ADVERTENCIA: la diferencia es mayor a la tolerancia esperada (1e-4).", file=sys.stderr)

    print(f"Exportado correctamente a {output_path} (input 1x3x{INPUT_SIZE}x{INPUT_SIZE}, output 1x{EMBEDDING_DIM}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

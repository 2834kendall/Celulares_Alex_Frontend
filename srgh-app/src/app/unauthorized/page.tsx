export default function UnauthorizedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4">
      <h1 className="text-2xl font-semibold">Acceso no autorizado</h1>
      <p className="text-sm text-gray-600 max-w-md">
        No tienes permiso para ver esta sección. Si crees que esto es un error,
        contacta a un administrador del sistema.
      </p>
    </div>
  );
}


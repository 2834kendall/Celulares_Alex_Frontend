module.exports = {
  extends: ['@commitlint/config-conventional'],
  parserPreset: {
    parserOpts: {
      headerPattern: /^(SGRH-\d+):\s(\w+)(?:\(([\w\$\.\-\* ]+)\))?\:\s(.+)$/,
      headerCorrespondence: ['jira', 'type', 'scope', 'subject']
    }
  },
  rules: {
    'type-empty': [2, 'never'],
    'subject-empty': [2, 'never'],
    'jira-key-required': [2, 'always']
  },
  plugins: [
    {
      rules: {
        'jira-key-required': (parsed) => {
          const { jira } = parsed
          return [
            !!jira,
            "Your commit message must start with a Jira ticket prefix (e.g., 'SGRH-57: feat(auth): add login page')"
          ]
        }
      }
    }
  ]
}

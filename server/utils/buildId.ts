export function resolveBuildId(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.BUILD_ID ||
    env.GITHUB_SHA ||
    env.RAILWAY_GIT_COMMIT_SHA ||
    env.VERCEL_GIT_COMMIT_SHA ||
    env.GIT_COMMIT_SHA ||
    'dev'
  )
}

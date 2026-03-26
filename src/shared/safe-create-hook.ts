interface SafeCreateHookOptions {
  enabled?: boolean
}

export function safeCreateHook<T>(
  name: string,
  factory: () => T,
  options?: SafeCreateHookOptions,
): T | null {
  const enabled = options?.enabled ?? true

  if (!enabled) {
    return null
  }

  try {
    return factory()
  } catch (error) {
    console.warn(`[safe-create-hook] Failed to create ${name}`, error)
    return null
  }
}

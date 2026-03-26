import type { CloudSolutionConfig } from "./config"
import type { ArtifactType } from "./domain"
import { SUPPORTED_ENTITY_KINDS } from "./domain"
import type { RuntimeContext } from "./plugin/types"

export type Managers = {
  scaffoldCatalog: {
    artifactTypes: ArtifactType[]
    entityKinds: string[]
    trustBoundary: string[]
  }
  projectRoot: string
}

export function createManagers(args: {
  context: RuntimeContext
  pluginConfig: CloudSolutionConfig
}): Managers {
  const { context, pluginConfig } = args

  return {
    scaffoldCatalog: {
      artifactTypes: [...pluginConfig.default_artifacts],
      entityKinds: [...SUPPORTED_ENTITY_KINDS],
      trustBoundary: [
        "input-capture",
        "normalization",
        "canonical-domain-model",
        "validation-and-rule-checks",
      ],
    },
    projectRoot: context.directory,
  }
}

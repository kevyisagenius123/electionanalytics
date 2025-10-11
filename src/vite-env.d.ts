/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RB_API: string
  readonly VITE_US_SIM_API: string
  readonly VITE_ELECTION_API: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

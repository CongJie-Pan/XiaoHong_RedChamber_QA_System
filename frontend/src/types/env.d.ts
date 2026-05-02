/**
 * Environment Variable Type Definitions
 * Why: Provides type safety and IDE autocompletion for process.env, 
 * ensuring that developers access valid configuration keys and 
 * reducing the risk of runtime undefined errors.
 */

declare namespace NodeJS {
  interface ProcessEnv {
    // =================================================================
    // BACKEND & AI API KEYS (Server-side only)
    // Why: These should generally not be accessed in the browser 
    // to prevent credential leakage. Defined here for full coverage.
    // =================================================================
    
    /** HuggingFace API Token */
    HF_TOKEN?: string;
    
    /** Custom HuggingFace Inference Endpoint URL */
    HF_ENDPOINT_URL?: string;
    
    /** OpenRouter API Key for multi-model access */
    OPENROUTER_API_KEY?: string;
    
    /** DeepInfra API Key for routing and OOD detection */
    DEEPINFRA_API_KEY?: string;

    // =================================================================
    // PUBLIC FRONTEND CONFIGURATION
    // Why: Variables prefixed with NEXT_PUBLIC_ are exposed to the 
    // browser by the Next.js build process.
    // =================================================================
    
    /** Custom API endpoint override */
    NEXT_PUBLIC_CHAT_API_ENDPOINT?: string;
    
    /** API request timeout override (ms) */
    NEXT_PUBLIC_API_TIMEOUT?: string;
    
    /** Maximum allowed message length override */
    NEXT_PUBLIC_MAX_MESSAGE_LENGTH?: string;

    // =================================================================
    // SYSTEM SETTINGS
    // =================================================================
    
    /** Current Node environment */
    NODE_ENV: 'development' | 'production' | 'test';
  }
}

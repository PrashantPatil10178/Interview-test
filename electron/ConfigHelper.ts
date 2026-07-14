// ConfigHelper.ts
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { EventEmitter } from "events";
import { OpenAI, AzureOpenAI } from "openai";

interface Config {
  apiKey: string;
  apiProvider: "openai" | "gemini" | "anthropic" | "azure"; // Added provider selection
  extractionModel: string;
  solutionModel: string;
  debuggingModel: string;
  language: string;
  opacity: number;
  // Azure OpenAI specific settings
  azureEndpoint: string;
  azureDeployment: string;
  azureApiVersion: string;
}

export class ConfigHelper extends EventEmitter {
  private configPath: string;
  private defaultConfig: Config = {
    apiKey: "",
    apiProvider: "gemini", // Default to Gemini
    extractionModel: "gemini-2.0-flash", // Default to Flash for faster responses
    solutionModel: "gemini-2.0-flash",
    debuggingModel: "gemini-2.0-flash",
    language: "python",
    opacity: 1.0,
    // Fall back to environment variables so Azure can be configured without the Settings UI
    azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT || "",
    azureDeployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "",
    azureApiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview",
  };

  constructor() {
    super();
    // Use the app's user data directory to store the config
    try {
      this.configPath = path.join(app.getPath("userData"), "config.json");
      console.log("Config path:", this.configPath);
    } catch (err) {
      console.warn("Could not access user data path, using fallback");
      this.configPath = path.join(process.cwd(), "config.json");
    }

    // Ensure the initial config file exists
    this.ensureConfigExists();
  }

  /**
   * Ensure config file exists
   */
  private ensureConfigExists(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        this.saveConfig(this.defaultConfig);
      }
    } catch (err) {
      console.error("Error ensuring config exists:", err);
    }
  }

  /**
   * Validate and sanitize model selection to ensure only allowed models are used
   */
  private sanitizeModelSelection(
    model: string,
    provider: "openai" | "gemini" | "anthropic" | "azure"
  ): string {
    if (provider === "openai") {
      // Only allow gpt-4o and gpt-4o-mini for OpenAI
      const allowedModels = ["gpt-4o", "gpt-4o-mini"];
      if (!allowedModels.includes(model)) {
        console.warn(
          `Invalid OpenAI model specified: ${model}. Using default model: gpt-4o`
        );
        return "gpt-4o";
      }
      return model;
    } else if (provider === "gemini") {
      // Only allow gemini-1.5-pro and gemini-2.0-flash for Gemini
      const allowedModels = ["gemini-1.5-pro", "gemini-2.0-flash"];
      if (!allowedModels.includes(model)) {
        console.warn(
          `Invalid Gemini model specified: ${model}. Using default model: gemini-2.0-flash`
        );
        return "gemini-2.0-flash"; // Changed default to flash
      }
      return model;
    } else if (provider === "anthropic") {
      // Only allow Claude models
      const allowedModels = [
        "claude-3-7-sonnet-20250219",
        "claude-3-5-sonnet-20241022",
        "claude-3-opus-20240229",
      ];
      if (!allowedModels.includes(model)) {
        console.warn(
          `Invalid Anthropic model specified: ${model}. Using default model: claude-3-7-sonnet-20250219`
        );
        return "claude-3-7-sonnet-20250219";
      }
      return model;
    } else if (provider === "azure") {
      // Azure model "names" are user-defined deployment names, so there's no fixed allowlist
      return model;
    }
    // Default fallback
    return model;
  }

  public loadConfig(): Config {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, "utf8");
        const config = JSON.parse(configData);

        // Ensure apiProvider is a valid value
        if (
          config.apiProvider !== "openai" &&
          config.apiProvider !== "gemini" &&
          config.apiProvider !== "anthropic" &&
          config.apiProvider !== "azure"
        ) {
          config.apiProvider = "gemini"; // Default to Gemini if invalid
        }

        // Sanitize model selections to ensure only allowed models are used
        if (config.extractionModel) {
          config.extractionModel = this.sanitizeModelSelection(
            config.extractionModel,
            config.apiProvider
          );
        }
        if (config.solutionModel) {
          config.solutionModel = this.sanitizeModelSelection(
            config.solutionModel,
            config.apiProvider
          );
        }
        if (config.debuggingModel) {
          config.debuggingModel = this.sanitizeModelSelection(
            config.debuggingModel,
            config.apiProvider
          );
        }

        return {
          ...this.defaultConfig,
          ...config,
        };
      }

      // If no config exists, create a default one
      this.saveConfig(this.defaultConfig);
      return this.defaultConfig;
    } catch (err) {
      console.error("Error loading config:", err);
      return this.defaultConfig;
    }
  }

  /**
   * Save configuration to disk
   */
  public saveConfig(config: Config): void {
    try {
      // Ensure the directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      // Write the config file
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (err) {
      console.error("Error saving config:", err);
    }
  }

  /**
   * Update specific configuration values
   */
  public updateConfig(updates: Partial<Config>): Config {
    try {
      const currentConfig = this.loadConfig();
      let provider = updates.apiProvider || currentConfig.apiProvider;

      // Auto-detect provider based on API key format if a new key is provided
      if (updates.apiKey && !updates.apiProvider) {
        // If API key starts with "sk-", it's likely an OpenAI key
        if (updates.apiKey.trim().startsWith("sk-")) {
          provider = "openai";
          console.log("Auto-detected OpenAI API key format");
        } else if (updates.apiKey.trim().startsWith("sk-ant-")) {
          provider = "anthropic";
          console.log("Auto-detected Anthropic API key format");
        } else {
          provider = "gemini";
          console.log("Using Gemini API key format (default)");
        }

        // Update the provider in the updates object
        updates.apiProvider = provider;
      }

      // If provider is changing, reset models to the default for that provider
      if (
        updates.apiProvider &&
        updates.apiProvider !== currentConfig.apiProvider
      ) {
        if (updates.apiProvider === "openai") {
          updates.extractionModel = "gpt-4o";
          updates.solutionModel = "gpt-4o";
          updates.debuggingModel = "gpt-4o";
        } else if (updates.apiProvider === "anthropic") {
          updates.extractionModel = "claude-3-7-sonnet-20250219";
          updates.solutionModel = "claude-3-7-sonnet-20250219";
          updates.debuggingModel = "claude-3-7-sonnet-20250219";
        } else if (updates.apiProvider === "azure") {
          // Azure has no fixed model list - all three stages use the same deployment
          const deployment =
            updates.azureDeployment ||
            currentConfig.azureDeployment ||
            process.env.AZURE_OPENAI_DEPLOYMENT_NAME ||
            "";
          updates.extractionModel = deployment;
          updates.solutionModel = deployment;
          updates.debuggingModel = deployment;
        } else {
          updates.extractionModel = "gemini-2.0-flash";
          updates.solutionModel = "gemini-2.0-flash";
          updates.debuggingModel = "gemini-2.0-flash";
        }
      }

      // If just the Azure deployment name changed (provider unchanged), keep the three
      // model fields in sync with it since Azure uses one deployment for everything
      if (
        provider === "azure" &&
        updates.azureDeployment &&
        !updates.extractionModel &&
        !updates.solutionModel &&
        !updates.debuggingModel
      ) {
        updates.extractionModel = updates.azureDeployment;
        updates.solutionModel = updates.azureDeployment;
        updates.debuggingModel = updates.azureDeployment;
      }

      // Sanitize model selections in the updates
      if (updates.extractionModel) {
        updates.extractionModel = this.sanitizeModelSelection(
          updates.extractionModel,
          provider
        );
      }
      if (updates.solutionModel) {
        updates.solutionModel = this.sanitizeModelSelection(
          updates.solutionModel,
          provider
        );
      }
      if (updates.debuggingModel) {
        updates.debuggingModel = this.sanitizeModelSelection(
          updates.debuggingModel,
          provider
        );
      }

      const newConfig = { ...currentConfig, ...updates };
      this.saveConfig(newConfig);

      // Only emit update event for changes other than opacity
      // This prevents re-initializing the AI client when only opacity changes
      if (
        updates.apiKey !== undefined ||
        updates.apiProvider !== undefined ||
        updates.extractionModel !== undefined ||
        updates.solutionModel !== undefined ||
        updates.debuggingModel !== undefined ||
        updates.language !== undefined ||
        updates.azureEndpoint !== undefined ||
        updates.azureDeployment !== undefined ||
        updates.azureApiVersion !== undefined
      ) {
        this.emit("config-updated", newConfig);
      }

      return newConfig;
    } catch (error) {
      console.error("Error updating config:", error);
      return this.defaultConfig;
    }
  }

  /**
   * Check if the API key is configured
   */
  public hasApiKey(): boolean {
    const config = this.loadConfig();
    return !!config.apiKey && config.apiKey.trim().length > 0;
  }

  /**
   * Validate the API key format
   */
  public isValidApiKeyFormat(
    apiKey: string,
    provider?: "openai" | "gemini" | "anthropic" | "azure"
  ): boolean {
    // If provider is not specified, attempt to auto-detect
    if (!provider) {
      if (apiKey.trim().startsWith("sk-")) {
        if (apiKey.trim().startsWith("sk-ant-")) {
          provider = "anthropic";
        } else {
          provider = "openai";
        }
      } else {
        provider = "gemini";
      }
    }

    if (provider === "openai") {
      // Basic format validation for OpenAI API keys
      return /^sk-[a-zA-Z0-9]{32,}$/.test(apiKey.trim());
    } else if (provider === "gemini") {
      // Basic format validation for Gemini API keys (usually alphanumeric with no specific prefix)
      return apiKey.trim().length >= 10; // Assuming Gemini keys are at least 10 chars
    } else if (provider === "anthropic") {
      // Basic format validation for Anthropic API keys
      return /^sk-ant-[a-zA-Z0-9]{32,}$/.test(apiKey.trim());
    } else if (provider === "azure") {
      // Azure OpenAI keys have no fixed prefix, just check it's a plausible length
      return apiKey.trim().length >= 32;
    }

    return false;
  }

  /**
   * Get the stored opacity value
   */
  public getOpacity(): number {
    const config = this.loadConfig();
    return config.opacity !== undefined ? config.opacity : 1.0;
  }

  /**
   * Set the window opacity value
   */
  public setOpacity(opacity: number): void {
    // Ensure opacity is between 0.1 and 1.0
    const validOpacity = Math.min(1.0, Math.max(0.1, opacity));
    this.updateConfig({ opacity: validOpacity });
  }

  /**
   * Get the preferred programming language
   */
  public getLanguage(): string {
    const config = this.loadConfig();
    return config.language || "python";
  }

  /**
   * Set the preferred programming language
   */
  public setLanguage(language: string): void {
    this.updateConfig({ language });
  }

  /**
   * Test API key with the selected provider
   */
  public async testApiKey(
    apiKey: string,
    provider?: "openai" | "gemini" | "anthropic" | "azure"
  ): Promise<{ valid: boolean; error?: string }> {
    // Auto-detect provider based on key format if not specified
    if (!provider) {
      if (apiKey.trim().startsWith("sk-")) {
        if (apiKey.trim().startsWith("sk-ant-")) {
          provider = "anthropic";
          console.log("Auto-detected Anthropic API key format for testing");
        } else {
          provider = "openai";
          console.log("Auto-detected OpenAI API key format for testing");
        }
      } else {
        provider = "gemini";
        console.log("Using Gemini API key format for testing (default)");
      }
    }

    if (provider === "openai") {
      return this.testOpenAIKey(apiKey);
    } else if (provider === "gemini") {
      return this.testGeminiKey(apiKey);
    } else if (provider === "anthropic") {
      return this.testAnthropicKey(apiKey);
    } else if (provider === "azure") {
      return this.testAzureKey(apiKey);
    }

    return { valid: false, error: "Unknown API provider" };
  }

  /**
   * Test OpenAI API key
   */
  private async testOpenAIKey(
    apiKey: string
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const openai = new OpenAI({ apiKey });
      // Make a simple API call to test the key
      await openai.models.list();
      return { valid: true };
    } catch (error: any) {
      console.error("OpenAI API key test failed:", error);

      // Determine the specific error type for better error messages
      let errorMessage = "Unknown error validating OpenAI API key";

      if (error.status === 401) {
        errorMessage =
          "Invalid API key. Please check your OpenAI key and try again.";
      } else if (error.status === 429) {
        errorMessage =
          "Rate limit exceeded. Your OpenAI API key has reached its request limit or has insufficient quota.";
      } else if (error.status === 500) {
        errorMessage = "OpenAI server error. Please try again later.";
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Test Gemini API key
   * Note: This is a simplified implementation since we don't have the actual Gemini client
   */
  private async testGeminiKey(
    apiKey: string
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // For now, we'll just do a basic check to ensure the key exists and has valid format
      // In production, you would connect to the Gemini API and validate the key
      if (apiKey && apiKey.trim().length >= 20) {
        // Here you would actually validate the key with a Gemini API call
        return { valid: true };
      }
      return { valid: false, error: "Invalid Gemini API key format." };
    } catch (error: any) {
      console.error("Gemini API key test failed:", error);
      let errorMessage = "Unknown error validating Gemini API key";

      if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Test Anthropic API key
   * Note: This is a simplified implementation since we don't have the actual Anthropic client
   */
  private async testAnthropicKey(
    apiKey: string
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // For now, we'll just do a basic check to ensure the key exists and has valid format
      // In production, you would connect to the Anthropic API and validate the key
      if (apiKey && /^sk-ant-[a-zA-Z0-9]{32,}$/.test(apiKey.trim())) {
        // Here you would actually validate the key with an Anthropic API call
        return { valid: true };
      }
      return { valid: false, error: "Invalid Anthropic API key format." };
    } catch (error: any) {
      console.error("Anthropic API key test failed:", error);
      let errorMessage = "Unknown error validating Anthropic API key";

      if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Test Azure OpenAI API key by making a minimal chat completion call
   * against the configured endpoint/deployment.
   */
  private async testAzureKey(
    apiKey: string
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const config = this.loadConfig();
      const endpoint = config.azureEndpoint || process.env.AZURE_OPENAI_ENDPOINT;
      const deployment =
        config.azureDeployment || process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
      const apiVersion =
        config.azureApiVersion ||
        process.env.AZURE_OPENAI_API_VERSION ||
        "2024-08-01-preview";

      if (!apiKey || apiKey.trim().length < 10) {
        return { valid: false, error: "Invalid Azure OpenAI API key format." };
      }
      if (!endpoint || !deployment) {
        return {
          valid: false,
          error:
            "Azure OpenAI endpoint and deployment name must be configured before testing the key.",
        };
      }

      const azure = new AzureOpenAI({ apiKey, endpoint, deployment, apiVersion });
      await azure.chat.completions.create({
        model: deployment,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      });
      return { valid: true };
    } catch (error: any) {
      console.error("Azure OpenAI API key test failed:", error);

      let errorMessage = "Unknown error validating Azure OpenAI API key";
      if (error.status === 401) {
        errorMessage =
          "Invalid API key. Please check your Azure OpenAI key and try again.";
      } else if (error.status === 404) {
        errorMessage =
          "Deployment not found. Check the Azure OpenAI endpoint and deployment name.";
      } else if (error.status === 429) {
        errorMessage =
          "Rate limit exceeded on this Azure OpenAI deployment.";
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      return { valid: false, error: errorMessage };
    }
  }
}

// Export a singleton instance
export const configHelper = new ConfigHelper();

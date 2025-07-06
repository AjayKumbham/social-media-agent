import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, Eye, EyeOff, CheckCircle, XCircle, Settings, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { securityService } from "@/services/securityService";

interface Llms {
  key: string;
  name: string;
  apiLabel: string;
  placeholder: string;
  getKeyUrl: string;
  required: boolean;
}

// The 3 LLM APIs as specified
const LLMS: Llms[] = [
  {
    key: "rapidapi",
    name: "RapidAPI ChatGPT",
    apiLabel: "RapidAPI Key (OpenAI GPT-4o)",
    placeholder: "Enter your RapidAPI key for ChatGPT access",
    getKeyUrl: "https://rapidapi.com/haxednet/api/chatgpt-42",
    required: true,
  },
  {
    key: "gemini",
    name: "Gemini",
    apiLabel: "Gemini API Key",
    placeholder: "Enter your Gemini API key",
    getKeyUrl: "https://aistudio.google.com/app/apikey",
    required: false,
  },
  {
    key: "groq",
    name: "GroqCloud",
    apiLabel: "Groq API Key (LLaMA3-8B-8192)",
    placeholder: "Enter your Groq API key",
    getKeyUrl: "https://console.groq.com/keys",
    required: false,
  },
];

type CredState = {
  [api: string]: string;
};

export const LlmApiDashboard = () => {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState<CredState>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      loadLlmCredentials();
    }
  }, [user]);

  const loadLlmCredentials = async () => {
    setLoading(true);
    try {
      await securityService.logCredentialAccess('llm_apis', 'view');
      
      const { data, error } = await supabase
        .from("llm_api_credentials")
        .select("api_name, api_key, is_connected")
        .eq("user_id", user.id);

      if (error) throw error;

      const credMap: CredState = {};
      const connMap: Record<string, boolean> = {};
      data?.forEach((row: any) => {
        credMap[row.api_name] = row.api_key || "";
        connMap[row.api_name] = !!row.is_connected && !!row.api_key;
      });

      setCredentials(credMap);
      setConnected(connMap);
    } catch (error) {
      console.error("Failed to load LLM API credentials", error);
      await securityService.logSecurityEvent({
        eventType: 'credential_access_failed',
        eventDetails: { 
          api_type: 'llm_apis',
          action: 'view',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
      toast({
        title: "Load Failed",
        description: "Failed to load LLM API credentials",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCredentialChange = (key: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [key]: value }));
  };

  const toggleShowKey = (key: string) => {
    setShowKey((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const testConnection = async (llmKey: string) => {
    const apiKey = credentials[llmKey];
    if (!apiKey) {
      toast({
        title: "Test Failed",
        description: "Please enter an API key before testing",
        variant: "destructive",
      });
      return;
    }

    // Validate API key format
    const sanitizedKey = securityService.sanitizeInput(apiKey);
    if (sanitizedKey !== apiKey) {
      toast({
        title: "Invalid API Key",
        description: "API key contains invalid characters",
        variant: "destructive",
      });
      return;
    }

    setTesting((prev) => ({ ...prev, [llmKey]: true }));

    try {
      const { data, error } = await supabase.functions.invoke('test-llm-connection', {
        body: {
          provider: llmKey,
          apiKey: sanitizedKey,
        },
      });

      if (error) throw error;

      const isSuccess = data?.success === true;
      setConnected((prev) => ({ ...prev, [llmKey]: isSuccess }));

      // Log the test attempt
      await securityService.logCredentialAccess(llmKey, isSuccess ? 'view' : 'view');

      // Update the database with the test result
      await supabase
        .from("llm_api_credentials")
        .upsert({
          user_id: user.id,
          api_name: llmKey,
          api_key: sanitizedKey,
          is_connected: isSuccess,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,api_name" });

      toast({
        title: isSuccess ? "Connection Successful" : "Connection Failed",
        description: isSuccess 
          ? `${LLMS.find(l => l.key === llmKey)?.name} is connected successfully` 
          : data?.error || "Failed to connect to the API",
        variant: isSuccess ? "default" : "destructive",
      });
    } catch (error: any) {
      console.error("Connection test failed", error);
      setConnected((prev) => ({ ...prev, [llmKey]: false }));
      
      await securityService.logSecurityEvent({
        eventType: 'api_connection_test_failed',
        eventDetails: {
          provider: llmKey,
          error: error.message
        }
      });
      
      toast({
        title: "Test Failed",
        description: `Connection test failed: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setTesting((prev) => ({ ...prev, [llmKey]: false }));
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      // Upsert for each API key present in the dashboard
      for (const llm of LLMS) {
        const apiKey = credentials[llm.key] || "";
        if (!apiKey && !connected[llm.key]) continue;

        // Sanitize the API key
        const sanitizedKey = securityService.sanitizeInput(apiKey);
        
        const { error } = await supabase
          .from("llm_api_credentials")
          .upsert({
            user_id: user.id,
            api_name: llm.key,
            api_key: sanitizedKey,
            is_connected: connected[llm.key] || false,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,api_name" });

        if (error) throw error;

        // Log credential update
        await securityService.logCredentialAccess(llm.key, 'update');
      }
      
      // Refresh state
      await loadLlmCredentials();

      toast({
        title: "LLM API Keys Saved",
        description: "Your LLM API keys have been saved successfully.",
      });
    } catch (error: any) {
      console.error("Failed to save LLM API credentials", error);
      await securityService.logSecurityEvent({
        eventType: 'credential_save_failed',
        eventDetails: {
          api_type: 'llm_apis',
          error: error.message
        }
      });
      toast({
        title: "Save Failed",
        description: `Failed to save API keys: ${error.message ?? error}`,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-800">
      <CardHeader>
        <CardTitle className="text-black dark:text-white flex items-center gap-2">
          <Settings className="w-5 h-5" />
          LLM API Keys
        </CardTitle>
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          Manage your keys for LLM APIs (RapidAPI, Gemini, Groq)
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="text-gray-600 dark:text-gray-400 py-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading...
          </div>
        ) : (
          <div className="grid gap-7">
            {LLMS.map((llm) => (
              <div className="space-y-3" key={llm.key}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Label htmlFor={`${llm.key}-api-key`} className="text-black dark:text-white">
                    {llm.apiLabel}
                  </Label>
                  <div className="flex items-center gap-2">
                    {connected[llm.key] ? (
                      <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge className="bg-white dark:bg-black text-red-600 dark:text-red-400 border-red-200 dark:border-red-700">
                        <XCircle className="w-3 h-3 mr-1" />
                        Not Connected
                      </Badge>
                    )}
                    {llm.required && (
                      <Badge className="bg-white dark:bg-black text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-700">
                        Required
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id={`${llm.key}-api-key`}
                      type={showKey[llm.key] ? "text" : "password"}
                      value={credentials[llm.key] || ""}
                      onChange={(e) => handleCredentialChange(llm.key, e.target.value)}
                      placeholder={llm.placeholder}
                      className="bg-white dark:bg-black border-gray-300 dark:border-gray-600 text-black dark:text-white pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white"
                      onClick={() => toggleShowKey(llm.key)}
                    >
                      {showKey[llm.key] ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <Button
                    onClick={() => testConnection(llm.key)}
                    disabled={testing[llm.key] || !credentials[llm.key]}
                    variant="outline"
                    size="sm"
                    className="bg-white dark:bg-black border-gray-300 dark:border-gray-600 text-black dark:text-white hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  >
                    {testing[llm.key] ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Test"
                    )}
                  </Button>
                </div>
                <div className="flex justify-between items-center text-xs text-gray-600 dark:text-gray-400">
                  <a
                    href={llm.getKeyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
                  >
                    Get API Key
                  </a>
                  <span className="text-gray-600 dark:text-gray-400">{llm.name}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            size="sm"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

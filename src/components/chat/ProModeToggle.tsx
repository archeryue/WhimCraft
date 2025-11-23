"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModelTier } from "@/config/models";

interface ProModeToggleProps {
  modelTier?: 'main' | 'pro';
  onModelTierChange?: (tier: 'main' | 'pro') => void;
}

export function ProModeToggle({
  modelTier = 'main',
  onModelTierChange
}: ProModeToggleProps) {
  const [showProDialog, setShowProDialog] = useState(false);
  const isPro = modelTier === 'pro';

  const handleTogglePro = () => {
    if (isPro) {
      // Disable PRO mode directly
      onModelTierChange?.('main');
    } else {
      // Show confirmation dialog for enabling
      setShowProDialog(true);
    }
  };

  const handleEnablePro = () => {
    onModelTierChange?.('pro');
    setShowProDialog(false);
  };

  return (
    <>
      {/* Floating PRO Mode Toggle Button */}
      <Button
        variant={isPro ? "default" : "outline"}
        size="sm"
        onClick={handleTogglePro}
        className={`h-9 px-4 text-xs font-semibold transition-all shadow-md ${
          isPro
            ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
        title={isPro ? "PRO mode enabled - Click to disable" : "Enable PRO mode for advanced reasoning"}
      >
        <Zap className={`w-4 h-4 mr-1.5 ${isPro ? "fill-yellow-300 text-yellow-300" : ""}`} />
        PRO {isPro ? "ON" : "OFF"}
      </Button>

      {/* PRO Mode Confirmation Dialog */}
      <Dialog open={showProDialog} onOpenChange={setShowProDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-600" />
              Enable PRO Mode?
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p className="text-slate-700">
                PRO mode uses <span className="font-semibold text-purple-600">Gemini 3.0 Pro</span> for superior reasoning and analysis.
              </p>

              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  <span>Higher quality responses with advanced reasoning</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  <span>Better handling of complex queries</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  <span>4K image generation (vs 2K in standard mode)</span>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mt-3">
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">Cost:</span> ~$0.03-0.05 per message (vs ~$0.001-0.002 in standard mode)
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowProDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEnablePro}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              <Zap className="w-4 h-4 mr-2 fill-yellow-300 text-yellow-300" />
              Enable PRO Mode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

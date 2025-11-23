"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut, Settings, Brain, User, Target, FileText, Zap } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ModelTier } from "@/config/models";

interface ChatTopBarProps {
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
  isAdmin?: boolean;
  modelTier?: 'main' | 'pro';
  onModelTierChange?: (tier: 'main' | 'pro') => void;
}

export function ChatTopBar({
  userName,
  userEmail,
  userAvatar,
  isAdmin,
  modelTier = 'main',
  onModelTierChange,
}: ChatTopBarProps) {
  const [imageError, setImageError] = useState(false);
  const [showProDialog, setShowProDialog] = useState(false);
  const isPro = modelTier === 'pro';

  const handleTogglePro = () => {
    if (isPro) {
      // Disable PRO mode directly
      onModelTierChange?.('main');
    } else {
      // Show confirmation dialog to enable PRO mode
      setShowProDialog(true);
    }
  };

  const handleEnablePro = () => {
    onModelTierChange?.('pro');
    setShowProDialog(false);
  };

  return (
    <>
      <div className="bg-white border-b border-slate-200 px-4 py-1 flex items-center justify-between shadow-sm select-none cursor-default">
        {/* Logo/Title */}
        <div className="flex items-center gap-3">
          <Target className="w-7 h-7 text-blue-600" strokeWidth={1.5} />
          <h1 className="text-base font-bold italic">
            <span className="text-blue-600">Whim</span>
            <span className="text-slate-800">Craft</span>
          </h1>

          {/* PRO Mode Toggle */}
          <Button
            variant={isPro ? "default" : "outline"}
            size="sm"
            onClick={handleTogglePro}
            className={`h-7 px-3 text-xs font-semibold transition-all ${
              isPro
                ? "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-md"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Zap className={`w-3.5 h-3.5 mr-1.5 ${isPro ? "fill-yellow-300 text-yellow-300" : ""}`} />
            PRO {isPro ? "ON" : "OFF"}
          </Button>
        </div>

      {/* User Menu Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors">
            {userAvatar && !imageError ? (
              <Image
                src={userAvatar}
                alt={userName || "User"}
                width={24}
                height={24}
                className="w-6 h-6 rounded-full"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-semibold shadow-sm">
                {userName?.charAt(0).toUpperCase() || "U"}
              </div>
            )}
            <span className="font-medium text-sm text-slate-700">{userName}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild>
            <Link href="/whim" className="flex items-center cursor-pointer">
              <FileText className="w-4 h-4 mr-2" />
              Whims
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/profile" className="flex items-center cursor-pointer">
              <Brain className="w-4 h-4 mr-2" />
              Memory Profile
            </Link>
          </DropdownMenuItem>
          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/admin?from=chat" className="flex items-center cursor-pointer">
                  <Settings className="w-4 h-4 mr-2" />
                  Admin Panel
                </Link>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-red-600 focus:text-red-600 cursor-pointer"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

      {/* PRO Mode Confirmation Dialog */}
      <Dialog open={showProDialog} onOpenChange={setShowProDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-600" />
              Enable PRO Mode?
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p>
                PRO mode uses <strong>Gemini 3.0 Pro</strong>, a more powerful AI model with advanced reasoning capabilities.
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-green-600 font-semibold">✓</span>
                  <span>Higher quality responses</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 font-semibold">✓</span>
                  <span>Better reasoning for complex queries</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 font-semibold">✓</span>
                  <span>Enhanced image generation (4K support)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-purple-600 font-semibold">$</span>
                  <span>Estimated cost: ~$0.03-0.05 per message</span>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                You can toggle PRO mode on/off anytime. This setting applies to this conversation only.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowProDialog(false)}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button
              onClick={handleEnablePro}
              className="flex-1 sm:flex-none bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              <Zap className="w-4 h-4 mr-2" />
              Enable PRO Mode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

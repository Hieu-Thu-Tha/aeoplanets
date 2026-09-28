import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { User } from "@shared/schema";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { WELCOME_GUIDE_VIDEO_URL } from "@/lib/page-guide-mock-data";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function WelcomeVideoModal() {
  const [, navigate] = useLocation();
  const [isOpen, setIsOpen] = useState(true);
  const startOnboarding = useMutation({
    mutationFn: async () => {
      await Promise.all([
        apiRequest("POST", "/api/onboarding/welcome-video/seen"),
        apiRequest("DELETE", "/api/auth/onboarding-progress"),
      ]);
    },
    onSuccess: () => {
      queryClient.setQueryData<User>(["/api/auth/user"], (user) =>
        user
          ? {
              ...user,
              seenWelcomeVideo: true,
              onboardingStep: null,
              onboardingData: null,
            }
          : user,
      );
      navigate("/onboarding");
    },
  });

  const dismiss = () => {
    if (startOnboarding.isPending) return;
    setIsOpen(false);
    startOnboarding.mutate();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-2xl gap-0 overflow-hidden border-card-border bg-card p-0 shadow-2xl sm:rounded-xl"
        data-testid="welcome-video-modal"
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <div className="aspect-video w-full bg-black">
          <iframe
            src={WELCOME_GUIDE_VIDEO_URL}
            title="Welcome to AEO Stars"
            className="h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        <div className="grid gap-6 border-t border-border p-6">
          <div className="grid gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-primary-border">
              Welcome to AEOSTARS
            </p>
            <DialogTitle className="text-2xl font-bold leading-tight tracking-tight">
              See what's inside AEO Stars
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              Watch a quick message from Manpreet, our founder, then dive into
              your dashboard.
            </DialogDescription>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              type="button"
              className="w-full font-semibold"
              onClick={dismiss}
              disabled={startOnboarding.isPending}
              data-testid="button-start-welcome-video"
            >
              Get Started
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-auto self-center bg-transparent px-2 py-0 underline underline-offset-4 hover:bg-transparent"
              onClick={dismiss}
              disabled={startOnboarding.isPending}
              data-testid="button-skip-welcome-video"
            >
              Skip video
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

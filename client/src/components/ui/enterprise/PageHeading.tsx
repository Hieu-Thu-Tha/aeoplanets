import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Link } from "wouter";
import {
  BookOpen,
  ChevronDown,
  ExternalLink,
  Info,
  Maximize2,
  Play,
} from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  getPageGuideMockData,
  MOCK_GUIDE_VIDEO_URL,
} from "@/lib/page-guide-mock-data";

interface GuideLink {
  href: string;
  label: string;
}

interface GuideVideoBase {
  title: string;
  duration?: string;
  poster?: string;
}

type GuideVideo = GuideVideoBase &
  (
    | { src: string; embedUrl?: never; content?: never }
    | { embedUrl: string; src?: never; content?: never }
    | { content: ReactElement; src?: never; embedUrl?: never }
  );

interface FullGuide {
  label: string;
  href?: string;
  title?: string;
  content: ReactNode;
}

export interface PageGuide {
  summary: ReactNode;
  textGuide: GuideLink;
  video: GuideVideo;
  fullGuide: FullGuide;
}

interface PageHeadingProps {
  title: ReactNode;
  titleText?: string;
  subtitle?: ReactNode;
  guide?: PageGuide;
  className?: string;
  headingClassName?: string;
  headingTestId?: string;
  subtitleClassName?: string;
  subtitleTestId?: string;
  leadingIcon?: ReactNode;
  showGuide?: boolean;
}

const guideRowInteractionClass =
  "transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

type YouTubePlayer = { destroy: () => void };
type YouTubeAPI = {
  Player: new (
    element: HTMLIFrameElement,
    options: { events: { onStateChange: (event: { data: number }) => void } },
  ) => YouTubePlayer;
};

let youtubeAPIReady: Promise<YouTubeAPI> | undefined;

function loadYouTubeAPI(): Promise<YouTubeAPI> {
  if (youtubeAPIReady) return youtubeAPIReady;

  youtubeAPIReady = new Promise((resolve, reject) => {
    const youtubeWindow = window as typeof window & {
      YT?: YouTubeAPI;
      onYouTubeIframeAPIReady?: () => void;
    };
    if (youtubeWindow.YT?.Player) {
      resolve(youtubeWindow.YT);
      return;
    }

    const previousReady = youtubeWindow.onYouTubeIframeAPIReady;
    youtubeWindow.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (youtubeWindow.YT?.Player) resolve(youtubeWindow.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => {
      youtubeAPIReady = undefined;
      reject(new Error("Unable to load YouTube player API"));
    };
    document.head.appendChild(script);
  });

  return youtubeAPIReady;
}

export function PageHeading({
  title,
  titleText,
  subtitle,
  guide,
  className,
  headingClassName,
  headingTestId,
  subtitleClassName,
  subtitleTestId,
  leadingIcon,
  showGuide,
}: PageHeadingProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const isVideoPlaying = useRef(false);
  const isTriggerHovered = useRef(false);
  const isContentHovered = useRef(false);
  const openedFromHover = useRef(false);
  const closedFromHover = useRef(false);
  const displayTitle =
    titleText ?? (typeof title === "string" ? title : "this page");
  const mockGuide = getPageGuideMockData(displayTitle);
  const shouldShowGuide = showGuide ?? Boolean(guide || mockGuide);
  const resolvedGuide: PageGuide = guide ?? {
    summary:
      mockGuide?.shortText ??
      `Learn how to use ${displayTitle} and understand the information shown on this page.`,
    textGuide: {
      href: "/resources",
      label: "Read the text guide",
    },
    video: {
      title: `Watch the ${mockGuide?.feature ?? displayTitle} overview`,
      embedUrl: mockGuide?.videoEmbedUrl ?? MOCK_GUIDE_VIDEO_URL,
    },
    fullGuide: {
      label: "Read the full guide",
      href: mockGuide?.fullGuideUrl ?? "",
      title: `${displayTitle} guide`,
      content: null,
    },
  };
  const overview = mockGuide?.shortText ?? resolvedGuide.summary;

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!isPopoverOpen) {
      setIsVideoOpen(false);
      isVideoPlaying.current = false;
    }
  }, [isPopoverOpen]);

  const supportsHover = () =>
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const openFromHover = (target: "trigger" | "content") => {
    if (!supportsHover()) return;

    if (target === "trigger") isTriggerHovered.current = true;
    if (target === "content") isContentHovered.current = true;
    openedFromHover.current = true;
    window.clearTimeout(closeTimer.current);
    setIsPopoverOpen(true);
  };

  const closeFromHover = (target: "trigger" | "content") => {
    if (!supportsHover()) return;

    if (target === "trigger") isTriggerHovered.current = false;
    if (target === "content") isContentHovered.current = false;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      if (!isTriggerHovered.current && !isContentHovered.current && !isVideoPlaying.current) {
        closedFromHover.current = true;
        setIsPopoverOpen(false);
      }
    }, 180);
  };

  const heading = (
    <h1 className={headingClassName} data-testid={headingTestId}>
      {leadingIcon}
      {title}
      {shouldShowGuide && (
        <Popover
          open={isPopoverOpen}
          onOpenChange={(open) => {
            window.clearTimeout(closeTimer.current);
            if (!open) openedFromHover.current = false;
            setIsPopoverOpen(open);
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className="ml-2 inline-flex h-6 w-6 shrink-0 align-middle items-center justify-center rounded-full border border-border bg-muted/30 text-sm font-normal transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Open ${displayTitle} guide`}
              data-testid="button-page-guide"
              onMouseEnter={() => openFromHover("trigger")}
              onMouseLeave={() => closeFromHover("trigger")}
              onPointerDown={() => {
                openedFromHover.current = false;
                closedFromHover.current = false;
              }}
            >
              <span className="font-bold leading-none" aria-hidden="true">
                ?
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={10}
            collisionPadding={16}
            className="w-[min(34rem,calc(100vw-2rem))] overflow-hidden border-border bg-popover text-popover-foreground p-0 shadow-xl"
            onMouseEnter={() => openFromHover("content")}
            onMouseLeave={() => closeFromHover("content")}
            onOpenAutoFocus={(event) => {
              if (openedFromHover.current) event.preventDefault();
            }}
            onCloseAutoFocus={(event) => {
              if (closedFromHover.current) {
                event.preventDefault();
                closedFromHover.current = false;
              }
            }}
            data-testid="page-guide-popover"
          >
            <div
              className="flex w-full items-center gap-3 border-b border-border bg-muted/20 px-5 py-4 text-left"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                <Info className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="min-w-0 flex-1 text-sm leading-6 text-foreground">
                {overview}
              </p>
            </div>

            <Collapsible
              open={isVideoOpen}
              onOpenChange={setIsVideoOpen}
              className="border-b border-border"
            >
              <CollapsibleTrigger
                className={cn(
                  "flex w-full items-center gap-3 px-5 py-4 text-left",
                  guideRowInteractionClass,
                )}
              >
                <VideoPreview video={resolvedGuide.video} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">
                    {resolvedGuide.video.title}
                  </span>
                  {resolvedGuide.video.duration && (
                    <span className="block text-xs text-muted-foreground">
                      {resolvedGuide.video.duration}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    isVideoOpen && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="px-5 pb-5">
                <div className="overflow-hidden rounded-md border border-border bg-background">
                  <div className="aspect-video overflow-hidden">
                    <GuideVideoPlayer
                      video={resolvedGuide.video}
                      disableFullscreen
                      onPlaybackChange={(playing) => {
                        isVideoPlaying.current = playing;
                        if (!playing && !isTriggerHovered.current && !isContentHovered.current) {
                          closeFromHover("content");
                        }
                      }}
                    />
                  </div>
                  <div className="flex justify-end border-t border-border bg-muted/20 p-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setIsVideoModalOpen(true)}
                      aria-label={`Expand ${resolvedGuide.video.title}`}
                      data-testid="button-expand-guide-video"
                    >
                      <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Expand video
                    </button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {resolvedGuide.fullGuide.href ? (
              resolvedGuide.fullGuide.href.startsWith("/") ? (
                <Link
                  href={resolvedGuide.fullGuide.href}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium",
                    guideRowInteractionClass,
                  )}
                  onClick={() => setIsPopoverOpen(false)}
                  data-testid="guide-full-link"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                      <BookOpen className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="font-semibold text-foreground">
                      {resolvedGuide.fullGuide.label}
                    </span>
                  </span>
                  <ExternalLink
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              ) : (
                <a
                  href={resolvedGuide.fullGuide.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium",
                    guideRowInteractionClass,
                  )}
                  data-testid="guide-full-link"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                      <BookOpen className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="font-semibold text-foreground">
                      {resolvedGuide.fullGuide.label}
                    </span>
                  </span>
                  <ExternalLink
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </a>
              )
            ) : (
              <div
                className={cn(
                  "flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium",
                  guideRowInteractionClass,
                )}
                aria-disabled="true"
                data-testid="guide-full-link-empty"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                    <BookOpen className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="font-semibold text-foreground">
                    {resolvedGuide.fullGuide.label}
                  </span>
                </span>
                <ExternalLink
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </h1>
  );

  const videoModal = (
    <Dialog open={isVideoModalOpen} onOpenChange={setIsVideoModalOpen}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl gap-0 overflow-hidden p-0 sm:w-[min(78vw,48rem)]">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle>{resolvedGuide.video.title}</DialogTitle>
          <DialogDescription>Expanded video guide</DialogDescription>
        </DialogHeader>
        <div className="aspect-video w-full overflow-hidden bg-black">
          <GuideVideoPlayer video={resolvedGuide.video} />
        </div>
      </DialogContent>
    </Dialog>
  );

  if (subtitle || className) {
    return (
      <>
        <div className={className}>
          {heading}
          {subtitle && (
            <p className={subtitleClassName} data-testid={subtitleTestId}>
              {subtitle}
            </p>
          )}
        </div>
        {videoModal}
      </>
    );
  }

  return (
    <>
      {heading}
      {videoModal}
    </>
  );
}

function VideoPreview({ video }: { video: GuideVideo }) {
  if ("src" in video) {
    return (
      <span className="relative h-9 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-black">
        <video
          src={video.src}
          poster={video.poster}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 text-white">
          <Play
            className="h-3.5 w-3.5 fill-current drop-shadow"
            aria-hidden="true"
          />
        </span>
      </span>
    );
  }

  const youtubeVideoId =
    "embedUrl" in video && typeof video.embedUrl === "string"
      ? video.embedUrl.match(/youtube(?:-nocookie)?\.com\/embed\/([^?&/]+)/)?.[1]
      : undefined;

  if (youtubeVideoId) {
    return (
      <span className="relative h-9 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-black">
        <img
          src={`https://i.ytimg.com/vi/${youtubeVideoId}/mqdefault.jpg`}
          alt=""
          className="h-full w-full object-cover"
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 text-white">
          <Play
            className="h-3.5 w-3.5 fill-current drop-shadow"
            aria-hidden="true"
          />
        </span>
      </span>
    );
  }

  return (
    <span className="flex h-9 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-primary/10 text-primary">
      <Play className="h-4 w-4 fill-current" aria-hidden="true" />
    </span>
  );
}

function GuideVideoPlayer({
  video,
  disableFullscreen = false,
  onPlaybackChange,
}: {
  video: GuideVideo;
  disableFullscreen?: boolean;
  onPlaybackChange?: (playing: boolean) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playbackChangeRef = useRef(onPlaybackChange);
  playbackChangeRef.current = onPlaybackChange;
  const isYouTubeEmbed = Boolean(video.embedUrl && /youtube(?:-nocookie)?\.com\/embed\//.test(video.embedUrl));
  const tracksPlayback = Boolean(onPlaybackChange);

  useEffect(() => {
    if (!isYouTubeEmbed || !tracksPlayback) return;

    let disposed = false;
    let player: YouTubePlayer | undefined;
    loadYouTubeAPI().then((api) => {
      if (disposed || !iframeRef.current) return;
      player = new api.Player(iframeRef.current, {
        events: {
          onStateChange: ({ data }) => playbackChangeRef.current?.(data === 1 || data === 3),
        },
      });
    }).catch(() => {});

    return () => {
      disposed = true;
      player?.destroy();
      playbackChangeRef.current?.(false);
    };
  }, [isYouTubeEmbed, tracksPlayback]);

  if ("content" in video) return video.content;

  if (video.embedUrl) {
    const embedUrl = isYouTubeEmbed && onPlaybackChange
      ? `${video.embedUrl}${video.embedUrl.includes("?") ? "&" : "?"}enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`
      : video.embedUrl;
    return (
      <iframe
        ref={iframeRef}
        src={embedUrl}
        title={video.title}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }

  return (
    <video
      src={video.src}
      poster={video.poster}
      className={cn(
        "h-full w-full object-contain",
        disableFullscreen &&
          "[&::-webkit-media-controls-fullscreen-button]:hidden",
      )}
      controls
      controlsList={disableFullscreen ? "nofullscreen noremoteplayback" : undefined}
      disablePictureInPicture={disableFullscreen}
      preload="metadata"
      onPlay={() => onPlaybackChange?.(true)}
      onPause={() => onPlaybackChange?.(false)}
      onEnded={() => onPlaybackChange?.(false)}
    >
      Your browser does not support embedded videos.
    </video>
  );
}

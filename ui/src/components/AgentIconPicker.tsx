import { useState, useMemo, useRef } from "react";
import { AGENT_ICON_NAMES, type AgentIconName } from "@paperclipai/shared";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AGENT_ICONS, getAgentIcon } from "../lib/agent-icons";

const DEFAULT_ICON: AgentIconName = "bot";

interface AgentIconProps {
  icon: string | null | undefined;
  /** When set, shows uploaded image instead of Lucide preset icon. */
  avatarUrl?: string | null;
  className?: string;
}

export function AgentIcon({ icon, avatarUrl, className }: AgentIconProps) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={cn("object-cover", className)}
      />
    );
  }
  const Icon = getAgentIcon(icon);
  return <Icon className={className} />;
}

interface AgentIconGridProps {
  value: string | null | undefined;
  onChange: (icon: string) => void;
}

export function AgentIconGrid({ value, onChange }: AgentIconGridProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const entries = AGENT_ICON_NAMES.map((name) => [name, AGENT_ICONS[name]] as const);
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter(([name]) => name.includes(q));
  }, [search]);

  return (
    <>
      <Input
        placeholder="Search icons..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-2 h-8 text-sm"
        autoFocus
      />
      <div className="grid grid-cols-7 gap-1 max-h-48 overflow-y-auto">
        {filtered.map(([name, Icon]) => (
          <button
            key={name}
            type="button"
            onClick={() => {
              onChange(name);
              setSearch("");
            }}
            className={cn(
              "flex items-center justify-center h-8 w-8 rounded hover:bg-accent transition-colors",
              (value ?? DEFAULT_ICON) === name && "bg-accent ring-1 ring-primary",
            )}
            title={name}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-7 text-xs text-muted-foreground text-center py-2">No icons match</p>
        )}
      </div>
    </>
  );
}

interface AgentIconPickerProps {
  value: string | null | undefined;
  onChange: (icon: string) => void;
  children: React.ReactNode;
}

export function AgentIconPicker({ value, onChange, children }: AgentIconPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <AgentIconGrid
          value={value}
          onChange={(icon) => {
            onChange(icon);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export interface ManageAgentAvatarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: string | null | undefined;
  avatarUrl: string | null | undefined;
  onSelectIcon: (icon: string) => void;
  onUploadFile: (file: File) => void;
  onRemoveAvatar: () => void;
  uploadPending?: boolean;
  removePending?: boolean;
}

export function ManageAgentAvatarDialog({
  open,
  onOpenChange,
  icon,
  avatarUrl,
  onSelectIcon,
  onUploadFile,
  onRemoveAvatar,
  uploadPending,
  removePending,
}: ManageAgentAvatarDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Profile picture</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onUploadFile(file);
            }}
          />
          <div className="flex justify-center">
            <div className="h-28 w-28 rounded-xl overflow-hidden bg-muted flex items-center justify-center ring-1 ring-border">
              <AgentIcon icon={icon} avatarUrl={avatarUrl} className="h-full w-full rounded-xl object-cover" />
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={uploadPending}
              onClick={() => fileRef.current?.click()}
            >
              {uploadPending ? "Uploading…" : "Upload image"}
            </Button>
            {avatarUrl ? (
              <Button type="button" variant="outline" disabled={removePending} onClick={onRemoveAvatar}>
                {removePending ? "Removing…" : "Remove image"}
              </Button>
            ) : null}
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground mb-2">Default icon</p>
            <AgentIconGrid value={icon} onChange={onSelectIcon} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

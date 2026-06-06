//! Sidebar footer user row — mirrors the desktop UserMenu: avatar circle +
//! signed-in email + a dropdown whose only action (for now) is sign out.
//! Fetches its own email so the shell doesn't have to thread it through.

"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import type { UserResponse } from "@supabase/supabase-js";
import { LogOut, User } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function CloudUserMenu({ onSignOut }: { onSignOut: () => void }) {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    void createClient()
      .auth.getUser()
      .then((res: UserResponse) => setEmail(res.data.user?.email ?? null));
  }, []);

  return (
    <div className="relative mx-2 mb-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {email ?? "Signed in"}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onClick={onSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { ScrollArea, cn } from "@houston-ai/core";
import { SidebarNavItem } from "./sidebar-nav";
import { SidebarItemRow } from "./sidebar-item-row";
import type { SidebarItemRowLabels } from "./sidebar-item-row";
import { sidebarClasses } from "./sidebar-classes";

export interface SidebarItem {
  id: string;
  name: string;
  icon?: ReactNode;
  /** Optional right-aligned slot for row badges or status indicators. */
  trailing?: ReactNode;
  /** Optional dropdown content rendered before built-in item actions. */
  menuContent?: ReactNode;
}

export interface SidebarNavItemEntry {
  id: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick: () => void;
  /** Optional right-aligned slot (e.g. a "Beta" badge). */
  trailing?: ReactNode;
  /** Extra DOM attributes (e.g. `data-tour-target`) on the rendered button. */
  dataAttrs?: Record<string, string>;
}

export interface SidebarProps {
  logo?: ReactNode;
  /** Header area rendered at the very top (e.g., space/org switcher) */
  header?: ReactNode;
  /** Nav items rendered below the header and above the items list */
  navItems?: SidebarNavItemEntry[];
  /** ID of the currently active nav item (for highlighting) */
  activeNavId?: string;
  items: SidebarItem[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onAdd?: () => void;
  /** Extra DOM attributes (e.g. `data-tour-target`) on the add-item button. */
  addItemDataAttrs?: Record<string, string>;
  onDelete?: (id: string) => void;
  onRename?: (id: string, newName: string) => void;
  sectionLabel?: string;
  /** Footer area rendered at the very bottom of the sidebar */
  footer?: ReactNode;
  labels?: SidebarLabels;
  children?: ReactNode;
  /**
   * Opt-in mobile drawer. When `onMobileClose` is provided, on narrow screens
   * (`max-md`) the sidebar becomes an off-canvas drawer toggled by `mobileOpen`,
   * with a backdrop. On `md+` it's the normal static sidebar. Consumers that
   * never pass `onMobileClose` (e.g. the desktop app) are completely unaffected
   * at every width.
   */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export interface SidebarLabels extends SidebarItemRowLabels {
  addItem?: string;
}

const DEFAULT_LABELS: Required<SidebarLabels> = {
  addItem: "Add item",
  moreOptions: "More options",
  renameItem: "Rename",
  deleteItem: "Delete",
};

export function AppSidebar({
  logo,
  header,
  navItems,
  activeNavId,
  items,
  selectedId,
  onSelect,
  onAdd,
  addItemDataAttrs,
  onDelete,
  onRename,
  sectionLabel,
  footer,
  labels,
  children,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const hasDefaultMenu = !!onDelete || !!onRename;
  const l = { ...DEFAULT_LABELS, ...labels };

  const startRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditValue(currentName);
  };

  const commitRename = (id: string) => {
    const trimmed = editValue.trim();
    const originalName = items.find((it) => it.id === id)?.name;
    if (trimmed && trimmed !== originalName && onRename) {
      onRename(id, trimmed);
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: KeyboardEvent, id: string) => {
    if (onDelete && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      onDelete(id);
    }
  };

  const showLogo = logo && !header;
  const drawer = !!onMobileClose;

  return (
    <>
      {/* Mobile drawer backdrop (opt-in). */}
      {drawer && (
        <div
          aria-hidden="true"
          onClick={onMobileClose}
          className={cn(
            "fixed inset-0 z-40 bg-black/40 md:hidden",
            mobileOpen ? "block" : "hidden",
          )}
        />
      )}
      <aside
        data-tour-target="sidebar"
        className={cn(
          "w-[220px] bg-sidebar text-sidebar-foreground flex flex-col h-full shrink-0",
          // Off-canvas drawer on mobile, normal static sidebar on md+.
          drawer &&
            "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:shadow-xl max-md:transition-transform max-md:duration-200",
          drawer && (mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"),
        )}
      >
        {/* Header slot (e.g., WorkspaceSwitcher) */}
        {header}

        {/* Legacy logo area (only when no header) */}
        {showLogo && (
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-2">{logo}</div>
          </div>
        )}

        {/* Nav items */}
        {navItems && navItems.length > 0 && (
          <nav className="px-2 py-1 space-y-0.5">
            {navItems.map((item) => (
              <SidebarNavItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                trailing={item.trailing}
                active={
                  activeNavId !== undefined
                    ? item.id === activeNavId
                    : item.active
                }
                onClick={item.onClick}
                dataAttrs={item.dataAttrs}
              />
            ))}
          </nav>
        )}

        {/* Agents section: label + items list, wrapped together so the tour
            can spotlight just this region. `flex-1 min-h-0` preserves the
            existing scroll behavior for the items list. */}
        <div
          data-tour-target="agents"
          className="flex min-h-0 flex-1 flex-col"
        >
        {/* Section label */}
        {sectionLabel && (
          <div className="px-3 pt-3 pb-1">
            <div className="text-xs font-medium text-muted-foreground">
              {sectionLabel}
            </div>
          </div>
        )}

        {/* Items list */}
        <ScrollArea className="flex-1 px-2">
          <div className={sidebarClasses.itemsList}>
            {items.map((item) => (
              <SidebarItemRow
                key={item.id}
                item={item}
                isActive={item.id === selectedId}
                isEditing={editingId === item.id}
                editValue={editValue}
                hasMenu={hasDefaultMenu || !!item.menuContent}
                onSelect={onSelect}
                onKeyDown={handleKeyDown}
                onEditChange={setEditValue}
                onCommitRename={commitRename}
                onCancelEdit={() => setEditingId(null)}
                onStartRename={onRename ? startRename : undefined}
                onDelete={onDelete}
                labels={l}
              />
            ))}
            {onAdd && (
              <button
                aria-label={l.addItem}
                onClick={onAdd}
                className={sidebarClasses.addButton}
                {...(addItemDataAttrs ?? {})}
              >
                <span className={sidebarClasses.addButtonInner}>
                  <Plus className={sidebarClasses.addButtonIcon} />
                  <span className={sidebarClasses.addButtonLabel}>
                    {l.addItem}
                  </span>
                </span>
              </button>
            )}
          </div>
        </ScrollArea>
        </div>

        {/* Footer slot (e.g., update notification) */}
        {footer}
      </aside>

      {children}
    </>
  );
}

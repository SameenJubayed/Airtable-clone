"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Box } from "@mui/material";
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import StarOutlineIcon from "@mui/icons-material/StarOutline";
import ShareOutlinedIcon from "@mui/icons-material/ShareOutlined";
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';

type SidebarProps = {
  headerHeight: number;    
  persistentOpen: boolean;
  hoverOpen: boolean;
  onHoverChange: (open: boolean) => void;
};

type SidebarContentProps = {
  pathname: string;
  onHoverChange: (open: boolean) => void;
};

export const SIDEBAR_CONSTANTS = {
  RAIL_WIDTH: 56,
  PANEL_WIDTH: 299,
};

const NAV = [
  { label: "Home", href: "/home", icon: <HomeOutlinedIcon /> },
  { label: "Starred", href: "/starred", icon: <StarOutlineIcon /> },
  { label: "Shared", href: "/shared", icon: <ShareOutlinedIcon /> },
  { label: "Workspaces", href: "/workspaces", icon: <PeopleOutlineIcon /> },
] as const;

function SidebarContent({ pathname, onHoverChange }: SidebarContentProps) {
  return (
    <Box
      sx={{ width: SIDEBAR_CONSTANTS.PANEL_WIDTH, height: "100%" }}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      <List sx={{ py: 1 }}>
        {NAV.map((item) => {
          const selected = pathname.startsWith(item.href);
          return (
            <ListItem key={item.href} disablePadding>
              <ListItemButton
                component={Link}
                href={item.href}
                selected={selected}
                dense
                sx={{
                  px: 1.25,
                  pr: 2,
                  height: 44,
                  "&.Mui-selected": {
                    backgroundColor: "rgba(2,132,199,0.08)", 
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.label}/>
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
}

export function Sidebar({
  headerHeight,
  persistentOpen,
  hoverOpen,
  onHoverChange,
}: SidebarProps) {
  const pathname = usePathname();

  const paperSx = {
    top: headerHeight,
    height: `calc(100vh - ${headerHeight}px)`,
    width: SIDEBAR_CONSTANTS.PANEL_WIDTH,
    borderRight: "1px solid #e5e7eb",   
    boxShadow: 1,                        
  } as const;

  return (
    <>
      {/* Collapsed rail (always visible) */}
      <div
        className="fixed left-0 z-10 border-r border-gray-200 bg-white"
        style={{
          width: SIDEBAR_CONSTANTS.RAIL_WIDTH,
          top: headerHeight,
          height: `calc(100vh - ${headerHeight}px)`,
        }}
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => onHoverChange(false)}
      >
        <div className="flex flex-col items-center gap-2 p-2">
          {NAV.map((item) => (
            <Link
              key={`rail-${item.href}`}
              href={item.href}
              title={item.label}
              className="h-9 w-9 rounded-md flex items-center justify-center text-gray-700 hover:bg-gray-100"
              onClick={() => onHoverChange(false)}
            >
              {item.icon}
            </Link>
          ))}
        </div>
      </div>

      {!persistentOpen && hoverOpen && (
        <Drawer
          variant="temporary"
          anchor="left"
          open
          onClose={() => onHoverChange(false)}
          hideBackdrop            // <<< prevents dimming
          ModalProps={{ keepMounted: true }}
          slotProps={{ paper: { sx: paperSx } }}
          transitionDuration={150}
        >
          <SidebarContent pathname={pathname} onHoverChange={onHoverChange} />
        </Drawer>
      )}

      {persistentOpen && (
        <Drawer
          variant="persistent"
          anchor="left"
          open
          slotProps={{ paper: { sx: paperSx } }}
          elevation={0}
          transitionDuration={150}
        >
          <SidebarContent pathname={pathname} onHoverChange={onHoverChange} />
        </Drawer>
      )}
    </>
  );
}

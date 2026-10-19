-- Ricing Town generated fragment for Hyprland 0.55+
-- Review this file before loading it. It contains appearance/input/monitor settings only.
hl.monitor({ output = "eDP-1", mode = "preferred", position = "0x0", scale = 1 })
hl.monitor({ output = "DP-1", mode = "2560x1440@144", position = "1920x0", scale = 1 })
hl.config({
  general = { gaps_in = 7, gaps_out = 14, border_size = 2, col = { active_border = 0xffcba6f7, inactive_border = 0xff24243a }, layout = "dwindle" },
  decoration = { rounding = 18, active_opacity = 0.98, inactive_opacity = 0.9,
    blur = { enabled = true, size = 12, passes = 3 },
    shadow = { enabled = true, range = 24, color = 0xff000000 }
  },
  input = { kb_layout = "us", follow_mouse = 1, touchpad = { natural_scroll = false } },
  animations = { enabled = true }
})
hl.animation({ leaf = "global", enabled = true, speed = 6, bezier = "default" })
hl.animation({ leaf = "windows", enabled = true, speed = 6, bezier = "default", style = "slide" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 6, bezier = "default", style = "slide" })
hl.bind("SUPER + RETURN", hl.dsp.exec_cmd("kitty"))
hl.bind("SUPER + B", hl.dsp.exec_cmd("firefox"))
hl.bind("SUPER + S", hl.dsp.exec_cmd("pavucontrol"))
hl.bind("SUPER + L", hl.dsp.exec_cmd("hyprlock"))
hl.window_rule({ match = { class = "pavucontrol" }, float = true, center = true })
hl.window_rule({ match = { class = "firefox" }, workspace = "2" })
hl.workspace_rule({ workspace = "1", monitor = "eDP-1", persistent = true })
hl.workspace_rule({ workspace = "2", monitor = "DP-1", persistent = true })
hl.on("hyprland.start", function()
  hl.exec_cmd("sh ~/.config/ricing-town/config/hybrid/start.sh")
end)

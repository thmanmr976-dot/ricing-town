-- Ricing Town generated fragment for Hyprland 0.55+
-- Review this file before loading it. It contains appearance/input/monitor settings only.
hl.monitor({ output = "", mode = "preferred", position = "auto", scale = 1 })
hl.config({
  general = { gaps_in = 12, gaps_out = 22, border_size = 1, col = { active_border = 0xff8b5e3c, inactive_border = 0xffc8bfae }, layout = "dwindle" },
  decoration = { rounding = 8, active_opacity = 1, inactive_opacity = 0.97,
    blur = { enabled = false, size = 8, passes = 2 },
    shadow = { enabled = true, range = 8, color = 0xff000000 }
  },
  input = { kb_layout = "us", follow_mouse = 1, touchpad = { natural_scroll = false } },
  animations = { enabled = true }
})
hl.animation({ leaf = "global", enabled = true, speed = 5, bezier = "default" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 5, bezier = "default", style = "fade" })

hl.on("hyprland.start", function()
  hl.exec_cmd("sh ~/.config/ricing-town/config/quickshell/start.sh")
end)

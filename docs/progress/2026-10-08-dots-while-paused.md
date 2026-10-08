# 2026-10-08: current dots while paused, scope scale in auto (branch claude/dots-while-paused-b6v1s5)

Done: Options > Show current when paused (user setting `pausedDots`, on by default). Upstream hides
current dots whenever the simulation is stopped; with the setting on, paused and rewound circuits
keep their dots standing still. Dots too fast to animate get a fixed phase while paused instead of
a random one, so the picture holds. Off restores upstream's behaviour (docs/deviations/).
Scope cards in auto scale that show voltage and current together now draw the grid and its
values for one plot's units (the selected plot, else the first voltage) instead of only the zero
line, as manual scale does (`gridSpec` in ScopeCardView.ts).

Next: nothing for this feature.
Open: none.

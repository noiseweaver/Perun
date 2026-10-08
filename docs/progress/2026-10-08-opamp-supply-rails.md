# 2026-10-08: op-amp supply rails (branch claude/opamp-supply-rails-02bdzt)

Done: the ideal op-amp (OpAmpElm, both input orders) has a Show supply rails checkbox, off by
default. When on, the symbol gets a short V+ and V- stub from the middle of each slanted side,
where the transistor-level op-amp has its rail pins, coloured by and labelled with Max Output
and Min Output (`+15V`, `-15V`, monospace). Drawing only; saved as the XML attribute `rl`
(docs/deviations/). The transistor-level op-amps already have real rail pins and are unchanged.
Next: nothing for this feature. The new dialog label is English only in every language.

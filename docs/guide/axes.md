# Axes and scales

Default scales are linear for scatter channels ($T$ = `$PnR`) and time channels ($T$ = the largest time in the group's samples, in seconds) and **logicle** ($W = 0.5$, $M = 4.5$, $A = 0$,
$T$ = `$PnR`) for fluorescence channels. In the inspector each axis offers:

- **Linear**: top $T$ and negative range $A$.
- **Log10**: top $T$ and decades $M$. Non-positive values cannot be shown and are piled on the axis
  minimum ([M-TR-LOGNP](../methods/transforms#m-tr-lognp-non-positive-values-on-a-log-scale)).
- **Logicle**: $T$, $W$, $M$, $A$. *Suggest W from data* estimates $W$ from the negative values of the
  displayed population.
- **Arcsinh**: cofactor $c$ of $\operatorname{asinh}(x/c)$ and top $T$.
- **Hyperlog**: $T$, $W$, $M$, $A$, as for logicle (Bagwell 2005).
- **Biex (FlowJo)**: FlowJo's own biexponential display, with FlowJo's settings: top $T$, width basis
  (default −10; more negative puts more data in the linear region around zero), positive decades
  (4.41854) and negative decades (0). It matches FlowJo's Biex scale, so gates copied by coordinates from a
  FlowJo Biex axis line up. Values beyond the ends of its range are piled on the axis, as in FlowJo.
- **Miltenyi**: log over $M$ decades below $T$ (default 4) and linear through zero and the negatives over
  $L$ decades (default 1), like MACSQuantify's display. FlowJo publishes no formula for its Miltenyi scale,
  so this one is Flowmeris's own and does not line up with FlowJo's exactly.
- **Min/Max (data)**: the displayed range in data units.

A number field left empty, or holding something that is not a number, goes back to its previous value.
Scale parameters the scale cannot use (e.g. $T \le 0$, or logicle $W > M/2$) are refused with a
message naming the rule.

Gates drawn on a Biex or Miltenyi axis export to Gating-ML as Flowmeris extensions, which other tools
(FlowKit, flowCore, FlowJo) cannot read; draw gates on logicle, arcsinh or hyperlog axes to exchange them.

Changing a scale sets that channel's default for new plots in the group. Existing gates keep their own
scale. Definitions: [Transforms](../methods/transforms).

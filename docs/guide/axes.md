# Axes and scales

Default scales are linear for scatter channels ($T$ = `$PnR`) and time channels ($T$ = the largest time in the group's samples, in seconds) and **logicle** ($W = 0.5$, $M = 4.5$, $A = 0$,
$T$ = `$PnR`) for fluorescence channels. In the inspector each axis offers:

- **Linear**: top $T$ and negative range $A$.
- **Log10**: top $T$ and decades $M$. Non-positive values cannot be shown and are piled on the axis
  minimum ([M-TR-LOGNP](../methods/transforms#m-tr-lognp-non-positive-values-on-a-log-scale)).
- **Logicle**: $T$, $W$, $M$, $A$. *Suggest W from data* estimates $W$ from the negative values of the
  displayed population.
- **Arcsinh**: cofactor $c$ of $\operatorname{asinh}(x/c)$ and top $T$.
- **Min/Max (data)**: the displayed range in data units.

Changing a scale sets that channel's default for new plots in the group. Existing gates keep their own
scale. Definitions: [Transforms](../methods/transforms).

# Transforms (axis scales)

Implementation: `packages/transforms`. Tests: `packages/transforms/src/transforms.test.ts`.

All scales use the Gating-ML 2.0 definitions and parameter names exactly, so gates expressed in a
transformed space mean the same thing in flowmeris, FlowKit, flowCore and any other compliant tool. Every
transform maps the top of scale $T$ to 1; plots display the range $[0, 1]$ by default.

A transform is identified by a hash of its parameters (`t_…`). Changing an axis scale creates a new
transform; existing gates keep the transform they were drawn in (see
[M-GATE-SPACE](./gating#m-gate-space-coordinates-of-a-gate)).

## M-TR-FLIN — linear

$$f(x) = \frac{x + A}{T + A}$$

The UI's *Linear* scale uses $T$ = `$PnR`, $A = 0$.

## M-TR-FLOG — log10

$$f(x) = \frac{1}{M}\log_{10}\!\frac{x}{T} + 1$$

$M$ is the number of decades shown below $T$.

### M-TR-LOGNP — non-positive values on a log scale

$\log_{10} x$ is undefined for $x \le 0$, which is common after compensation. flowmeris evaluates
$f(x) = \text{NaN}$ for $x \le 0$ and then:

- **gating:** NaN fails every gate test on that dimension, so such events are in no population defined on
  that log dimension (including none of the four quadrants);
- **plots:** such events are drawn piled on the axis minimum, and their count is printed under the plot
  ("*n* non-positive on log axis");
- **statistics in transformed space:** they are excluded and reported in `n_excluded`.

Logicle or arcsinh scales are recommended for compensated fluorescence data because they display
negative values (Parks et al. 2006).

## M-TR-FASINH — arcsinh

$$f(x) = \frac{\operatorname{asinh}\!\left(x\,\sinh(M\ln 10)/T\right) + A\ln 10}{(M + A)\ln 10}$$

The UI edits the familiar **cofactor** $c$ of $\operatorname{asinh}(x/c)$. For a given $T$ the stored
parameters are $M = \operatorname{asinh}(T/c)/\ln 10$, so with $A = 0$,
$f(x) = \operatorname{asinh}(x/c)/\operatorname{asinh}(T/c)$; conversely $c = T/\sinh(M \ln 10)$.

## M-TR-LOGICLE — logicle (biexponential)

The logicle scale is the inverse of the biexponential function

$$B(y) = a\,e^{b y} - c\,e^{-d y} + f,$$

with $w = W/(M+A)$, $x_2 = A/(M+A)$, $x_1 = x_2 + w$, $x_0 = x_2 + 2w$, $b = (M+A)\ln 10$, and $d$
solving $2\ln d + w d = 2\ln b - w b$ (Moore & Parks 2012). Data value 0 maps to $x_1$; $T$ maps to 1.

flowmeris is a direct port of the reference implementation (Moore & Parks 2012): Halley's method for
$B^{-1}$, a 16-term Taylor series near $x_1$, and the bracketed Newton/bisection solver for $d$.
Parameters are validated: $T > 0$, $W \ge 0$, $M > 0$, $W \le M/2$, $-W \le A \le M - 2W$.

Defaults for fluorescence channels: $T$ = `$PnR` (at least 1024), $W = 0.5$, $M = 4.5$, $A = 0$.
**Suggest W** sets $W = \tfrac12\bigl(M - \log_{10}(T/|r|)\bigr)$ where $r$ is the 5th percentile of the
negative values of the displayed population (Parks et al. 2006), clamped to $[0, M/2]$.

Numerical notes (deviations from the reference only where it fails):

1. For $w < 10^{-12}$ the solver for $d$ returns its limit $d = b$; the iteration loses all precision
   with subnormal $w$.
2. If Halley's method has not converged after 40 iterations (only seen for subnormal inputs), the scale
   value is found by bisection on the monotone inverse.
3. For $W = 0$ the reference initial guess can start tiny positive values far below $x_1$, outside the
   Taylor region; flowmeris uses the linear initial guess whenever the logarithmic guess lies below $x_1$.

Property tests check that $f^{-1}(f(x)) = x$ (relative error ≤ 10⁻⁹) and that $f$ is strictly
increasing over randomly drawn valid parameters.

::: warning FlowJo "Biex" is not logicle
FlowJo's biexponential display uses its own parameterisation (width basis, positive/negative decades)
and is not numerically identical to Gating-ML logicle. Gates copied by coordinates between FlowJo and
flowmeris will not line up unless both use the same transform. Use Gating-ML export/import to move gates
between tools.
:::

## M-TR-HYPERLOG — hyperlog

Implemented for Gating-ML import (Bagwell 2005), with the same $(T, W, M, A)$ parameterisation and the
Taylor-series/Halley structure of FlowUtils.

## M-TR-TICKS — axis ticks

Linear axes: "nice" 1–2–5 steps, labelled with K/M/G suffixes. Other scales: major ticks at $0$ and
$\pm 10^k$, minor ticks at $\pm m \cdot 10^k$, $m = 2…9$; major labels closer than 4.5% of the axis to an
already labelled tick are suppressed, keeping 0 and the largest magnitudes.

## References

- Parks DR, Roederer M, Moore WA. A new "Logicle" display method avoids deceptive effects of logarithmic scaling for low signals and compensated data. *Cytometry A* 2006;69:541–551.
- Moore WA, Parks DR. Update for the logicle data scale including operational code implementations. *Cytometry A* 2012;81:273–277.
- Bagwell CB. Hyperlog — a flexible log-like transform for negative, zero, and positive valued data. *Cytometry A* 2005;64:34–42.
- Spidlen J, et al. Gating-ML 2.0. *Cytometry A* 2015;87:683–687.

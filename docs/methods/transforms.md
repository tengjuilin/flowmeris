# Transforms (axis scales)

Implementation: `packages/transforms`. Tests: `packages/transforms/src/transforms.test.ts`.

All scales except biex and Miltenyi use the Gating-ML 2.0 definitions and parameter names exactly, so
gates expressed in a transformed space mean the same thing in Flowmeris, FlowKit, flowCore and any other
compliant tool. Biex and Miltenyi have no Gating-ML element; they are exported as Flowmeris extension
elements that other tools do not read ([ADR-0014](../adr/0014-non-gating-ml-scales)). Every
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

$\log_{10} x$ is undefined for $x \le 0$, which is common after compensation. Flowmeris evaluates
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

Flowmeris is a direct port of the reference implementation (Moore & Parks 2012): Halley's method for
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
   Taylor region; Flowmeris uses the linear initial guess whenever the logarithmic guess lies below $x_1$.

Property tests check that $f^{-1}(f(x)) = x$ (relative error ≤ 10⁻⁹) and that $f$ is strictly
increasing over randomly drawn valid parameters.

::: warning FlowJo "Biex" is not logicle
FlowJo's biexponential display uses its own parameterisation (width basis, positive/negative decades)
and is not numerically identical to Gating-ML logicle. Gates copied by coordinates between FlowJo and
Flowmeris line up only on the same scale: use the *Biex (FlowJo)* scale
([M-TR-BIEX](#m-tr-biex-flowjo-biex)) for gates drawn on FlowJo's Biex axes.
:::

## M-TR-HYPERLOG — hyperlog

Bagwell (2005), with the same $(T, W, M, A)$ parameterisation, validation and defaults as logicle and the
Taylor-series/Halley structure of FlowUtils.

## M-TR-BIEX — FlowJo biex

FlowJo's own biexponential display (FlowJo 10), which is not logicle. Parameters, with FlowJo's names
and defaults: top $T$ (`maxRange`, `$PnR`), width basis $w_b$ (`width`, $-10$), positive decades $p$
(`pos`, 4.41854) and extra negative decades $n$ (`neg`, 0). Flowmeris ports FlowKit's
`generate_biex_lut`, itself ported from FlowJo's Java code through cytolib:

1. $w = \log_{10}(-w_b)$, decades $D = p - w/2$, extra $E = n + w/2$;
2. the zero channel $z = \min\bigl(\lfloor 4096E/(E + D)\rfloor, 2048\bigr)$, and if $z > 0$,
   $D = 4096E/z$; then $w \leftarrow w/(2D)$, $P = D\ln 10$, $m = T e^{-P}$;
3. $N$ solves $2\ln N + wN = 2\ln P - wP$ (bracketed Newton/bisection, as in FlowJo);
4. for channels $i = 0…4096$, $u_i = e^{iP/4097}$ and $v_i = s\,e^{-iN/4097}$ with
   $s = e^{(P + N)(w + E/D)}$; for $i \ge z$, $x_i = m\,(u_i - v_i - (u_z - v_z))$, and below $z$ the table
   is mirrored, $x_i = -x_{2z - i}$.

The scale is the table read by linear interpolation, channel $/ 4096$, so the top of the table is 1.
Values beyond either end of the table are held at 0 or 1 (piled on the axis, as in FlowJo), and the inverse
holds at the end values. Parameters are validated: $T > 0$, $w_b \le -1$, $n \ge 0$, $p > w/2$. Axis ticks
beyond the ends of the table are left out. Golden test: FlowKit's `WSPBiexTransform` forward and inverse
for four parameter sets, within $10^{-10}$.

## M-TR-MILTENYI — Miltenyi

FlowJo's *Miltenyi* scale imitates the MACSQuantify display: log for positive values, linear through
zero and the negatives. FlowJo publishes no formula, so Flowmeris defines its own; it is not numerically
FlowJo's. With $x_0 = T\cdot 10^{-M}$, in decades

$$u(x) = \begin{cases} \log_{10}(x/x_0) & x \ge x_0 \\ (x/x_0 - 1)/\ln 10 & x < x_0 \end{cases}
\qquad f(x) = \frac{u + L}{M + L}.$$

Below $x_0$ the scale is the tangent of the log part, so it is smooth at $x_0$ and linear down through zero
($f(0) = (L - 1/\ln 10)/(M+L)$) into the negatives. $M$ is the number of log decades, $L$ the width of the
linear part shown below $x_0$, in the same decades: the axis minimum is $x_0(1 - L\ln 10)$. Defaults:
$T$ = `$PnR`, $M = 4$, $L = 1$. Validated: $T > 0$, $M > 0$, $L \ge 0$. Golden test: a NumPy
implementation of this definition, forward and inverse for three parameter sets.

## M-TR-TICKS — axis ticks

Linear axes: "nice" 1–2–5 steps, labeled with K/M/G suffixes. Other scales: major ticks at $0$ and
$\pm 10^k$, minor ticks at $\pm m \cdot 10^k$, $m = 2…9$; major labels closer than 4.5% of the axis to an
already labeled tick are suppressed, keeping 0 and the largest magnitudes. A tick whose value the scale
does not map back to itself (past the ends of the biex table) is left out.

## References

- Parks DR, Roederer M, Moore WA. A new "Logicle" display method avoids deceptive effects of logarithmic scaling for low signals and compensated data. *Cytometry A* 2006;69:541–551.
- Moore WA, Parks DR. Update for the logicle data scale including operational code implementations. *Cytometry A* 2012;81:273–277.
- Bagwell CB. Hyperlog — a flexible log-like transform for negative, zero, and positive valued data. *Cytometry A* 2005;64:34–42.
- Spidlen J, et al. Gating-ML 2.0. *Cytometry A* 2015;87:683–687.

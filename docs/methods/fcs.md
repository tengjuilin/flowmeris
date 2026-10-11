# FCS parsing

Implementation: `packages/fcs` (`parse.ts` with `header.ts`, `text.ts`, `dataset.ts` and `data.ts`; `linearize.ts`, `write.ts`). Tests: `packages/fcs/src/fcs.test.ts`.

Flowmeris reads FCS 2.0, 3.0, 3.1 and 3.2 files (Spidlen et al. 2010, 2021), including files with
several datasets chained by `$NEXTDATA`. Each dataset becomes one *sample*.

## M-FCS-HEADER — HEADER segment

The first 58 bytes contain the version string (`FCS3.1`, …) and six 8-byte, right-justified ASCII
offsets: TEXT start/end, DATA start/end and ANALYSIS start/end, relative to the start of the dataset.
Blank fields are read as 0. Unsupported versions are rejected (`E-VERSION`).

## M-FCS-TEXT — TEXT segment

- The first byte is the delimiter. A **doubled delimiter** inside a keyword or value encodes a literal
  delimiter character (FCS 3.1 §3.2.9).
- Keyword names are case-insensitive (FCS 3.0+) and are stored upper-cased; values are kept verbatim.
- The segment is decoded as UTF-8 (FCS 3.1); if that fails it is decoded as ISO-8859-1 and
  `Q-TEXT-NOT-UTF8` is recorded.
- Supplemental TEXT (`$BEGINSTEXT`/`$ENDSTEXT`) is merged; the primary TEXT wins on conflicts.

## M-FCS-OFFSETS — locating DATA

FCS 3.x requires `$BEGINDATA`/`$ENDDATA`; the HEADER fields are 0 when an offset exceeds 99,999,999.
By default the TEXT keywords are authoritative for FCS 3.x and the HEADER for FCS 2.0 (FlowKit/FlowIO
convention). When both are present and disagree, `Q-DATA-OFFSET-MISMATCH` is recorded and states which
values were used.

## M-FCS-DATA — decoding events

Only list mode (`$MODE L`) is supported (`E-MODE` otherwise).

| `$DATATYPE` | Decoding |
|---|---|
| `I` | Unsigned integers of `$PnB` bits (8, 16, 24, 32, 40–64; multiples of 8). Byte order from `$BYTEORD`. |
| `F` | IEEE-754 single precision. |
| `D` | IEEE-754 double precision. |
| `A` | ASCII: fixed width `$PnB` characters, or delimited when `$PnB = *`. |

- FCS 3.2 per-parameter `$PnDATATYPE` overrides `$DATATYPE`.
- `$BYTEORD`: ascending (`1,2,3,4`) = little-endian, descending = big-endian; any other permutation is
  applied literally to values of the same width (e.g. legacy `3,4,1,2`).
- **Integer range masking.** Bits above the smallest power of two ≥ `$PnR` are ignored:
  stored value $= c \bmod 2^{\lceil \log_2 \mathrm{PnR} \rceil}$ (FCS 3.1 §3.2.20; FlowIO convention).
- If the DATA segment holds fewer complete events than `$TOT`, the complete events are read and
  `Q-DATA-SHORT` is recorded; extra trailing bytes give `Q-DATA-EXTRA-BYTES`.

Stored values are kept as Float32 where that is exact (single-precision data; integers up to 24 bits)
and Float64 otherwise.

## M-FCS-LIN — linearization

Stored channel values $c$ become linear data values $x$:

$$
x = \begin{cases}
\dfrac{10^{\,f_1 c / R}\, f_2}{G} & \text{if } f_1 > 0 \quad (\texttt{\$PnE} = f_1,f_2) \\[1.2ex]
\dfrac{c \cdot \tau}{G} & \text{time channel} \\[1ex]
\dfrac{c}{G} & \text{otherwise}
\end{cases}
$$

with $R$ = `$PnR`, $G$ = `$PnG` (1 if absent, and forced to 1 for the time channel) and
$\tau$ = `$TIMESTEP`. If $f_1 > 0$ and $f_2 = 0$, $f_2 = 1$ is used (`Q-PNE-ZERO-F2`).

The operation order and float64 arithmetic match FlowKit's `Sample` pre-processing. FCS 3.2 forbids
`$PnG` on non-integer data and the combination of gain with log amplification is unusual; Flowmeris
applies the gain as FlowKit does and records `Q-PNG-NONINT-32` / `Q-PNG-WITH-LOG` so the decision is
visible.

The time channel is the channel whose `$PnTYPE` is `Time` (FCS 3.2) or whose `$PnN` is `Time`
(case-insensitive). Scatter channels are those with `$PnTYPE` `Forward_Scatter`/`Side_Scatter` or a
`$PnN` starting with `FSC`/`SSC`.

::: info Floating-point note
`10^y` is evaluated with JavaScript's `Math.pow`, which can differ from the C library `pow` used by
NumPy by one unit in the last place for some inputs. Log-amplified channels can therefore differ from
FlowKit by ≤ 1 ULP (relative 2·10⁻¹⁶). See [Validation](../validation/).
:::

## M-FCS-WRITE — FCS 3.1 output

Gated-event export writes FCS 3.1, `$DATATYPE F`, `$BYTEORD 1,2,3,4`, `$MODE L`. DATA offsets are
written in the HEADER (when ≤ 99,999,999) and as zero-padded `$BEGINDATA`/`$ENDDATA`. The writer picks a
delimiter that occurs in no keyword or value (a value beginning with the delimiter cannot be escaped
unambiguously). Original keywords are kept except per-parameter and segment keywords; provenance
keywords `FLOWMERIS_VERSION`, `FLOWMERIS_SRC_SHA256`, `FLOWMERIS_SRC_FILE`, `FLOWMERIS_POPULATION` and
`FLOWMERIS_VALUES` are added. The CRC field is written as `00000000`, which FCS 3.1 permits.

## Warning and error codes

| Code | Meaning |
|---|---|
| `Q-TEXT-NOT-UTF8` | TEXT decoded as ISO-8859-1 |
| `Q-TEXT-NO-TRAILING-DELIM` | TEXT lacks its final delimiter; last value kept |
| `Q-TEXT-ODD-TOKENS` | odd number of TEXT tokens; last ignored |
| `Q-TEXT-DUP-KEY` | keyword repeated with a different value; first kept |
| `Q-DATA-OFFSET-MISMATCH` | HEADER and TEXT DATA offsets disagree |
| `Q-DATA-SHORT` / `Q-DATA-EXTRA-BYTES` / `Q-DATA-TRUNCATED` | DATA length inconsistent with `$TOT` |
| `Q-PNN-MISSING` | `$PnN` absent; channel named `Pn` |
| `Q-PNR-INVALID` | `$PnR` not numeric; `2^$PnB` used |
| `Q-PNE-INVALID` / `Q-PNE-ZERO-F2` / `Q-PNE-LOG-NONINT` | `$PnE` problems |
| `Q-PNG-WITH-LOG` / `Q-PNG-NONINT-32` | gain applied in a non-standard situation |
| `Q-PNB-FLOAT-WIDTH` | `$PnB` inconsistent with F/D data |
| `Q-NEXTDATA-OOB` | `$NEXTDATA` points beyond the file |
| `E-*` | the file cannot be read; the message says why |

## References

- Spidlen J, Moore W, Parks D, et al. Data File Standard for Flow Cytometry, version FCS 3.1. *Cytometry A* 2010;77:97–100.
- Spidlen J, Moore W, Brinkman RR, et al. Data File Standard for Flow Cytometry, Version FCS 3.2. *Cytometry A* 2021;99:100–102.
- White S, Quinn J, Enzor J, et al. FlowKit: a Python toolkit for integrated manual and automated cytometry analysis workflows. *Front Immunol* 2021;12:768541.

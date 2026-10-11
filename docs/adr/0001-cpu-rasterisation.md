# ADR-0001 CPU rasterisation in workers

**Status.** Accepted.

**Decision.** Plots are binned and colored on the CPU in Web Workers. The main thread receives an RGBA
image. WebGL is not used.
**Why.** Binning 10⁶ events costs a few milliseconds, about the same as uploading them to a GPU. The
output is byte-deterministic, which allows golden-image tests, and the same code serves screen and
export. Tiled views with dozens of panels would exceed browsers' limit of about 16 WebGL contexts.

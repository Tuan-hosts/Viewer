# K562 Viewer prediction data

Lossless native-resolution overfit predictions, clipped training targets, support masks, and target-matched distance + DNase baseline coefficients. These are fitting-set results from 72 independent 100-epoch models, not held-out predictions.

The public interface is https://tuan-hosts.github.io/Viewer/. It downloads only the selected window. Float32 byte-plane encoding and gzip preserve every stored value; no downsampling or lossy quantization is used.

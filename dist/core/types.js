"use strict";
// Core types for cross-chain swaps
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapStatus = exports.ChainAdapter = void 0;
class ChainAdapter {
    constructor(config) {
        this.config = config;
    }
}
exports.ChainAdapter = ChainAdapter;
var SwapStatus;
(function (SwapStatus) {
    SwapStatus["CREATED"] = "created";
    SwapStatus["SRC_DEPLOYED"] = "src_deployed";
    SwapStatus["DST_DEPLOYED"] = "dst_deployed";
    SwapStatus["COMPLETED"] = "completed";
    SwapStatus["CANCELLED"] = "cancelled";
    SwapStatus["FAILED"] = "failed";
})(SwapStatus || (exports.SwapStatus = SwapStatus = {}));

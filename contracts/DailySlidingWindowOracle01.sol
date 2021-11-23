pragma solidity =0.6.6;

import '@ixswap1/lib/contracts/libraries/FixedPoint.sol';
import '@ixswap1/v2-core/contracts/interfaces/IIxsOracle.sol';

import './libraries/SafeMath.sol';
import './libraries/IxsV2Library.sol';
import './libraries/IxsV2OracleLibrary.sol';

// Based on ExampleComputeLiquidityValue (thus base on tested parent)
// sliding window oracle that uses observations collected over a window to provide moving price averages in the past
// `windowSize` with a precision of `windowSize / granularity`.
// It is using most recent observation available within the last `fallbackWindowSize` in case the desired observation is missing.
// note this is a singleton oracle and only needs to be deployed once per desired parameters, which
// differs from the simple oracle which must be deployed once per pair.
contract DailySlidingWindowOracle01 is IIxsOracle {
    using FixedPoint for *;
    using SafeMath for uint256;

    struct Observation {
        uint256 timestamp;
        uint256 price0Cumulative;
        uint256 price1Cumulative;
    }

    address public immutable factory;
    
    // the desired amount of time over which the moving average should be computed, e.g. 24 hours
    uint256 public constant windowSize = 86400; // 1 day

    // the desired amount of time over which the moving average should be computed, e.g. 48 hours
    uint256 public constant fallbackWindowSize = 86400 * 2; // 2 days

    // the number of observations stored for each pair, i.e. how many price observations are stored for the window.
    // as granularity increases from 1, more frequent updates are needed, but moving averages become more precise.
    // averages are computed over intervals with sizes in the range:
    //   [windowSize - (windowSize / granularity) * 2, windowSize]
    // e.g. if the window size is 24 hours, and the granularity is 24, the oracle will return the average price for
    //   the period:
    //   [now - [22 hours, 24 hours], now]
    uint8 public constant granularity = 24; // 24 oservations per window, every hour basically
    
    // this is redundant with granularity and windowSize, but stored for gas savings & informational purposes.
    uint256 public immutable periodSize;

    // mapping from pair address to a list of price observations of that pair
    mapping(address => Observation[]) public pairObservations;

    // mapping from pair address the index of the last observation of that pair
    mapping(address => uint8) public pairFallbackObservationIndex;

    constructor(address factory_) public {
        require(
            (periodSize = windowSize / granularity) * granularity == windowSize,
            'SlidingWindowOracle: WINDOW_NOT_EVENLY_DIVISIBLE'
        ); // assertion to avoid human factor issues
        factory = factory_;
    }

    // returns the index of the observation corresponding to the given timestamp
    function observationIndexOf(uint256 timestamp) public view returns (uint8 index) {
        uint256 epochPeriod = timestamp / periodSize;
        return uint8(epochPeriod % granularity);
    }

    // returns the observation from the oldest epoch (at the beginning of the window) relative to the current time
    function getFirstObservationInWindow(address pair) private view returns (Observation storage firstObservation) {
        uint8 observationIndex = observationIndexOf(block.timestamp);
        // no overflow issue. if observationIndex + 1 overflows, result is still zero.
        uint8 firstObservationIndex = (observationIndex + 1) % granularity;
        firstObservation = pairObservations[pair][firstObservationIndex];
    }

    function hasFallbackObservation(address pair) private view returns (bool) {
        return pairFallbackObservationIndex[pair] > 0;
    }

    // returns fallback observation for a pair (the last observation)
    function getFallbackObservation(address pair) private view returns (Observation storage fallbackObservation) {
        require(hasFallbackObservation(pair), 'SlidingWindowOracle: MISSING_FALLBACK_OBSERVATION');

        // take in consideration the +1 offset, never underflows...
        fallbackObservation = pairObservations[pair][pairFallbackObservationIndex[pair] - 1];
    }

    // update the cumulative price for the observation at the current timestamp. each observation is updated at most
    // once per epoch period.
    function update(address tokenA, address tokenB) external override {
        address pair = IxsV2Library.pairFor(factory, tokenA, tokenB);

        // populate the array with empty observations (first call only)
        for (uint256 i = pairObservations[pair].length; i < granularity; i++) {
            pairObservations[pair].push();
        }

        // get the observation for the current period
        uint8 observationIndex = observationIndexOf(block.timestamp);
        Observation storage observation = pairObservations[pair][observationIndex];

        // we only want to commit updates once per period (i.e. windowSize / granularity)
        uint256 timeElapsed = block.timestamp - observation.timestamp;
        if (timeElapsed > periodSize) {
            (uint256 price0Cumulative, uint256 price1Cumulative, ) = IxsV2OracleLibrary.currentCumulativePrices(pair);
            observation.timestamp = block.timestamp;
            observation.price0Cumulative = price0Cumulative;
            observation.price1Cumulative = price1Cumulative;
            // keep the +1 offset so that the 0 index will serve as an indicator that there was no observation at all
            pairFallbackObservationIndex[pair] = observationIndex + 1;
        }
    }

    // given the cumulative prices of the start and end of a period, and the length of the period, compute the average
    // price in terms of how much amount out is received for the amount in
    function computeAmountOut(
        uint256 priceCumulativeStart,
        uint256 priceCumulativeEnd,
        uint256 timeElapsed,
        uint256 amountIn
    ) private pure returns (uint256 amountOut) {
        // overflow is desired.
        FixedPoint.uq112x112 memory priceAverage =
            FixedPoint.uq112x112(uint224((priceCumulativeEnd - priceCumulativeStart) / timeElapsed));
        amountOut = priceAverage.mul(amountIn).decode144();
    }

    function canConsult(address tokenA, address tokenB) external view override returns (bool) {
        address pair = IxsV2Library.pairFor(factory, tokenA, tokenB);

        if (pairObservations[pair].length <= 0) return false; // no observations at all...

        Observation storage firstObservation = getFirstObservationInWindow(pair);
        uint256 timeElapsed = block.timestamp - firstObservation.timestamp;

        if (timeElapsed <= windowSize) {
            return true;
        }
        
        if (hasFallbackObservation(pair)) {
            Observation storage fallbackObservation = getFallbackObservation(pair);
            uint256 timeElapsedSinceLastObservation = block.timestamp - fallbackObservation.timestamp;

            return timeElapsedSinceLastObservation <= fallbackWindowSize;
        }

        return false;
    }

    // returns the amount out corresponding to the amount in for a given token using the moving average over the time
    // range [now - [windowSize, windowSize - periodSize * 2], now]
    // update must have been called for the bucket corresponding to timestamp `now - windowSize`
    // as a fallback- the last observation within the fallbackWindowSize
    function consult(
        address tokenIn,
        uint256 amountIn,
        address tokenOut
    ) external view override returns (uint256 amountOut) {
        address pair = IxsV2Library.pairFor(factory, tokenIn, tokenOut);

        require(pairObservations[pair].length > 0, 'SlidingWindowOracle: MISSING_HISTORICAL_OBSERVATION');

        uint256 _windowSize = windowSize;
        Observation storage firstObservation = getFirstObservationInWindow(pair);
        uint256 timeElapsed = block.timestamp - firstObservation.timestamp;

        if (timeElapsed > _windowSize && hasFallbackObservation(pair)) {
            firstObservation = getFallbackObservation(pair);
            timeElapsed = block.timestamp - firstObservation.timestamp;
            _windowSize = fallbackWindowSize;
        }

        // checking firstObservation.timestamp to be > 0 does not make any difference here
        // as the timeElapsed will be whole epoch time, indeed bigger than _windowSize
        require(timeElapsed <= _windowSize, 'SlidingWindowOracle: MISSING_HISTORICAL_OBSERVATION');
        // should never happen.
        require(
            _windowSize == fallbackWindowSize || timeElapsed >= _windowSize - periodSize * 2,
            'SlidingWindowOracle: UNEXPECTED_TIME_ELAPSED'
        );

        (uint256 price0Cumulative, uint256 price1Cumulative, ) = IxsV2OracleLibrary.currentCumulativePrices(pair);
        (address token0, ) = IxsV2Library.sortTokens(tokenIn, tokenOut);

        if (token0 == tokenIn) {
            return computeAmountOut(firstObservation.price0Cumulative, price0Cumulative, timeElapsed, amountIn);
        } else {
            return computeAmountOut(firstObservation.price1Cumulative, price1Cumulative, timeElapsed, amountIn);
        }
    }
}

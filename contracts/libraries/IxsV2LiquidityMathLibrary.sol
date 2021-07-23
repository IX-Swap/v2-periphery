pragma solidity >=0.5.0;

import '@ixswap1/v2-core/contracts/interfaces/IIxsV2Pair.sol';
import '@ixswap1/v2-core/contracts/interfaces/IIxsV2Factory.sol';
import '@ixswap1/lib/contracts/libraries/Babylonian.sol';
import '@ixswap1/lib/contracts/libraries/FullMath.sol';

import './SafeMath.sol';
import './IxsV2Library.sol';

// library containing some math for dealing with the liquidity shares of a pair, e.g. computing their exact value
// in terms of the underlying tokens
library IxsV2LiquidityMathLibrary {
    using SafeMath for uint256;

    // computes the direction and magnitude of the profit-maximizing trade
    function computeProfitMaximizingTrade(
        uint256 truePriceTokenA,
        uint256 truePriceTokenB,
        uint256 reserveA,
        uint256 reserveB,
        bool isSecurityPool
    ) internal pure returns (bool aToB, uint256 amountIn) {
        aToB = FullMath.mulDiv(reserveA, truePriceTokenB, reserveB) < truePriceTokenA;

        uint256 invariant = reserveA.mul(reserveB);

        uint256 leftSide =
            Babylonian.sqrt(
                FullMath.mulDiv(
                    invariant.mul(1000),
                    aToB ? truePriceTokenA : truePriceTokenB,
                    (aToB ? truePriceTokenB : truePriceTokenA).mul(isSecurityPool ? 990 : 997)
                )
            );
        uint256 rightSide = (aToB ? reserveA.mul(1000) : reserveB.mul(1000)) / (isSecurityPool ? 990 : 997);

        if (leftSide < rightSide) return (false, 0);

        // compute the amount that must be sent to move the price to the profit-maximizing price
        amountIn = leftSide.sub(rightSide);
    }

    // gets the reserves after an arbitrage moves the price to the profit-maximizing ratio given an externally observed true price
    function getReservesAfterArbitrage(
        address factory,
        address tokenA,
        address tokenB,
        uint256 truePriceTokenA,
        uint256 truePriceTokenB,
        bool isSecurityPool
    ) internal view returns (uint256 reserveA, uint256 reserveB) {
        // first get reserves before the swap
        (reserveA, reserveB) = IxsV2Library.getReserves(factory, tokenA, tokenB);

        require(reserveA > 0 && reserveB > 0, 'IxsV2ArbitrageLibrary: ZERO_PAIR_RESERVES');

        // then compute how much to swap to arb to the true price
        (bool aToB, uint256 amountIn) =
            computeProfitMaximizingTrade(truePriceTokenA, truePriceTokenB, reserveA, reserveB, isSecurityPool);

        if (amountIn == 0) {
            return (reserveA, reserveB);
        }

        // now affect the trade to the reserves
        if (aToB) {
            uint256 amountOut = IxsV2Library.getAmountOut(amountIn, reserveA, reserveB, isSecurityPool);
            reserveA += amountIn;
            reserveB -= amountOut;
        } else {
            uint256 amountOut = IxsV2Library.getAmountOut(amountIn, reserveB, reserveA, isSecurityPool);
            reserveB += amountIn;
            reserveA -= amountOut;
        }
    }

    // computes liquidity value given all the parameters of the pair
    function computeLiquidityValue(
        uint256 reservesA,
        uint256 reservesB,
        uint256 totalSupply,
        uint256 liquidityAmount,
        bool feeOn,
        uint256 kLast
    ) internal pure returns (uint256 tokenAAmount, uint256 tokenBAmount) {
        if (feeOn && kLast > 0) {
            uint256 rootK = Babylonian.sqrt(reservesA.mul(reservesB));
            uint256 rootKLast = Babylonian.sqrt(kLast);
            if (rootK > rootKLast) {
                uint256 numerator1 = totalSupply;
                uint256 numerator2 = rootK.sub(rootKLast);
                uint256 denominator = rootK.mul(5).add(rootKLast);
                uint256 feeLiquidity = FullMath.mulDiv(numerator1, numerator2, denominator);
                totalSupply = totalSupply.add(feeLiquidity);
            }
        }
        return (reservesA.mul(liquidityAmount) / totalSupply, reservesB.mul(liquidityAmount) / totalSupply);
    }

    // get all current parameters from the pair and compute value of a liquidity amount
    // **note this is subject to manipulation, e.g. sandwich attacks**. prefer passing a manipulation resistant price to
    // #getLiquidityValueAfterArbitrageToPrice
    function getLiquidityValue(
        address factory,
        address tokenA,
        address tokenB,
        uint256 liquidityAmount
    ) internal view returns (uint256 tokenAAmount, uint256 tokenBAmount) {
        (uint256 reservesA, uint256 reservesB) = IxsV2Library.getReserves(factory, tokenA, tokenB);
        IIxsV2Pair pair = IIxsV2Pair(IxsV2Library.pairFor(factory, tokenA, tokenB));
        bool feeOn = IIxsV2Factory(factory).feeTo() != address(0);
        uint256 kLast = feeOn ? pair.kLast() : 0;
        uint256 totalSupply = pair.totalSupply();
        return computeLiquidityValue(reservesA, reservesB, totalSupply, liquidityAmount, feeOn, kLast);
    }

    // given two tokens, tokenA and tokenB, and their "true price", i.e. the observed ratio of value of token A to token B,
    // and a liquidity amount, returns the value of the liquidity in terms of tokenA and tokenB
    function getLiquidityValueAfterArbitrageToPrice(
        address factory,
        address tokenA,
        address tokenB,
        uint256 truePriceTokenA,
        uint256 truePriceTokenB,
        uint256 liquidityAmount,
        bool isSecurityPool
    ) internal view returns (uint256 tokenAAmount, uint256 tokenBAmount) {
        bool feeOn = IIxsV2Factory(factory).feeTo() != address(0);
        IIxsV2Pair pair = IIxsV2Pair(IxsV2Library.pairFor(factory, tokenA, tokenB));
        uint256 kLast = feeOn ? pair.kLast() : 0;
        uint256 totalSupply = pair.totalSupply();

        // this also checks that totalSupply > 0
        require(totalSupply >= liquidityAmount && liquidityAmount > 0, 'ComputeLiquidityValue: LIQUIDITY_AMOUNT');

        (uint256 reservesA, uint256 reservesB) =
            getReservesAfterArbitrage(factory, tokenA, tokenB, truePriceTokenA, truePriceTokenB, isSecurityPool);

        return computeLiquidityValue(reservesA, reservesB, totalSupply, liquidityAmount, feeOn, kLast);
    }
}

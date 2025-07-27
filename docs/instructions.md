Read /docs/hackathon.md

Goal is to create a fully functioning extension for 1inch Cross-chain Swap (Fusion+).

We'll be completing multiple chains in this process, so structure repo in a way that accounts for that. The extensions to swapping is the PRIMARY goal and must be fully functioning. We want the stretch goals of partial fills and relayer/resolver as well.

We'll also complete the secondary goal at the end, where we make an UI that will leverage as many 1inch APIs as possible AND our newly created extensions.

For now, the goal is just to the chain extensions. I'm just telling you the overall plan so you structure the repo in a way that makes sense for the final completed project.
IMPORTANT goal is that it must be fully functioning and meet all the requirements (Preserve hashlock and timelock functionality for the non-EVM implementation, Swap functionality should be bidirectional, onchain execution of token transfers can be presented during the final demo)

Let's start with:
1) Monad
2) Tron
3) Sui

We'll add other chains after but for now start with these 3. Make fully working. We want to use (basic working for demo) relayer/resolver system but also allow for manual resolver for demo without the relayer/resolver.
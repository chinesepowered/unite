Read /docs/hackathon.md

Goal is to create a fully functioning extension for 1inch Cross-chain Swap (Fusion+).

We'll be completing multiple chains in this process, so structure repo in a way that accounts for that. The extensions to swapping is the PRIMARY goal and must be fully functioning. We want the stretch goals of partial fills and relayer/resolver as well if they're not too hard to implement.

We'll MAYBE complete the secondary goal at the end, where we make an UI that will leverage as many 1inch APIs as possible AND our newly created extensions.

For now, the goal is just to the chain extensions since that's the main goal. I'm just telling you the overall plan so you structure the repo in a way that makes sense for the final completed project in case we also do the secondary goal.
IMPORTANT goal is that it must be fully functioning and meet all the requirements (Preserve hashlock and timelock functionality for the non-EVM implementation, Swap functionality should be bidirectional, onchain execution of token transfers can be presented during the final demo).

I'll provide the 1inch API key in a .env later if that's needed anywhere but it seems from devrel we shouldn't be making any API calls at all so this likely won't be needed.
Current repo is a blank nextjs template with app router for your convenience (in addition to these instructions in /docs). Feel free to remove and replace if this is not the best setup for this hackathon project and demo.

Their devrel team says:
-on EVM side, deploy 1nch escrow using 1nch escrow factory
-on non-EVM side, deploy my escrow contract
-handle all cross-chain orchestration between the two chains escrow contracts
-manage HTLC and communication between eth and other chain
--properly handle hashlock logic
--properly handle contract expiration/reverts
-swaps must be bi-directional. not between non-EVM chains, but between source ethereum chain and the target chain. eg: ETH<>MON and ETH<>SUI but NOT MON<>SUI. no interaction needed between the new chains we're supporting.
-do NOT post orders to REST APIs since that's with live resolvers, and resolvers are whitelisted KYC. ONLY work at smart contract level without broadcasting to everyone. still fusion+ orders but not broadcast to everyone
--no API call at all to do the fusion+ integration track! do it directly at the smart contract level. at the escrow contract, contract calls, etc. see example project 
-https://github.com/1inch/cross-chain-resolver-example shows how to swap between ETH and BNB, use this as basis and starting point for how it should be done
-forked mainnet tested locally may be a good starting point for first iteration since testnet may not have contracts deployed? then deploy to testnet everything? then mainnet later?

Some resource links:
https://github.com/1inch/cross-chain-sdk cross chain SDK from 1inch, to be used on ethereum EVM side (except monad, it's EVM but not supported to this SDK yet)
https://portal.1inch.dev/documentation/apis/swap/fusion-plus/fusion-plus-sdk/for-integrators/sdk-overview
https://portal.1inch.dev/documentation/apis/swap/fusion-plus/fusion-plus-sdk/for-integrators/when-and-how-to-submit-secrets
https://github.com/1inch/cross-chain-resolver-example 

Let's start with:
1) Monad
2) Tron
3) Sui

We'll add other chains after but for now start with these 3. Make fully working. We want to use (basic working for demo, maybe polling or whatever is easiest to implement and demo) relayer/resolver system but also allow for manual resolver for demo without the relayer/resolver.

Overall, we want to win this hackathon, so my notes here may not be the best and use your judgment to build what's needed. Be extra careful on the smart contracts and make sure they're right and robust.

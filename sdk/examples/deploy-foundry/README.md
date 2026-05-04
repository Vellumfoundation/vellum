# Foundry Deployment Example

```bash
export VELLUM_RPC_URL="http://127.0.0.1:8545"
export PRIVATE_KEY="0x..."

forge create src/Counter.sol:Counter \
  --rpc-url "$VELLUM_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --legacy \
  --gas-price 1000000000

forge script script/DeployCounter.s.sol \
  --rpc-url "$VELLUM_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --legacy \
  --gas-price 1000000000
```

# Monday product release authority

Before changing consumer UI, runtime status semantics, routing, continuity or completion behavior, run:

```bash
node product/verify-product-contract.mjs
```

Authority order for this integration branch:
1. `MONDAY_PRODUCT_CONSTITUTION_V1.md`
2. `KNOWN_REJECTIONS_V1.json` (release-blocking counterevidence)
3. `CONTINUUM_INTEGRATION_PLAN.json`
4. implementation evidence and readback

The existing sovereign runtime is a donor body. It does not override the consumer product constitution. A green technical test cannot waive a product rejection, and a product mockup cannot satisfy an execution gate.

CREATE UNIQUE INDEX "financing_offers_active_claim_uq" ON "jejak"."financing_offers" USING btree ("tenant_id","claim_id") WHERE "jejak"."financing_offers"."status" in ('OFFERED', 'ACCEPTED');

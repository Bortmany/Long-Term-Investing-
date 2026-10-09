# Decision 1.2: Gulf live price feed

Status: proposed. Checked 2026-09-30.

**The question.** Can we buy a delayed price feed for MSX (Oman), Tadawul (Saudi), DFM (Dubai), ADX (Abu Dhabi) and QSE (Qatar)? And can we show those prices on public SEO pages?

**Findings**
- No vendor we could check covers all five markets. Oman (MSX) is the gap.
- Public display is the bigger problem. The vendors' normal plans are for private or internal use. Showing prices to the public needs a separate paid licence.
- The exchanges sell their own data. MSX data is sold through ICE, and a redistribution licence would be negotiated directly.

| Provider | Markets covered (checked) | Delay | Monthly cost | Public web display | FX included | Free key |
|---|---|---|---|---|---|---|
| Twelve Data | Tadawul (XSAU, Pro plan and up). ADX (XADS) and QSE (DSMD) on Pro. DFM (XDFM) needs Ultra. No MSX. [exchanges list](https://twelvedata.com/exchanges), 2026-09-30 | Tadawul is end-of-day only [XSAU page](https://twelvedata.com/exchanges/XSAU) | Pro $99, Ultra $329 [pricing](https://twelvedata.com/pricing), 2026-09-30 | No. Needs a redistribution add-on or written deal [terms](https://twelvedata.com/terms) | Yes | Yes, 800 calls a day, non-commercial only |
| EODHD | Not found on its 70-exchange lists [list](https://eodhd.com/list-of-stock-markets), 2026-09-30 | 15 minutes | $19.99 to $99.99 [pricing](https://eodhd.com/pricing), 2026-09-30 | No. Display is barred on personal plans; business terms by sales only [terms](https://eodhd.com/financial-apis/terms-conditions) | Yes | Yes, 20 calls a day |
| FMP higher plans | Could not verify. Their pages blocked the check, and the exchange list we could see shows no Gulf markets. | Unknown | Not verified | Not verified | Yes | Yes |
| Marketstack | Gulf not confirmed [product](https://marketstack.com/product), 2026-09-30 | Unknown | $9.99 to $149.99 | Not stated | Not stated | Yes, 100 calls |
| Exchange or ICE direct | MSX and Tadawul are sold through ICE [MSX page](https://developer.ice.com/fixed-income-data-services/catalog/muscat-stock-exchange-msx), 2026-09-30 | Live or delayed | Quote only | By negotiation | No | No |
| Argaam or Mubasher | Only news APIs found, no price API | n/a | n/a | n/a | n/a | n/a |

**Symbol formats.** EODHD writes symbols as code plus suffix, for example ".SR". Twelve Data takes the ticker plus an exchange code, for example "7203" with XSAU. The FMP format is not confirmed.

**Data layer.** Our data layer (`fmp.ts`, `provider.ts`) allows a new provider to be added. Adding one is small once a licence is settled.

Not verified: FMP's Gulf coverage and its public-display terms (its pages blocked the check), and whether EODHD lists Gulf markets in its live exchange list. To confirm EODHD, call its exchanges endpoint with the free key.

## Recommendation: keep manual Gulf prices for now and email Twelve Data sales for a written public-display quote covering Tadawul, ADX, QSE and DFM. Until then, public stock pages show company facts and never vendor prices; MSX stays manual whatever we choose.

**Owner decision (2026-09-30):** approved as recommended.

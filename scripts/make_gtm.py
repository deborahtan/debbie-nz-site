#!/usr/bin/env python3
"""
Generates the full-site tracking plan (gtm-data-dictionary.md) and an importable GTM container
(gtm-container-export.json) from ONE definition below, so the plan and the container can't drift.

  python3 scripts/make_gtm.py

Import: GTM → Admin → Import Container → choose gtm-container-export.json → Merge → Rename conflicting.
Then set the GA4 Measurement ID in the "CONST - GA4 Measurement ID" variable and publish.
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OLD = json.loads((ROOT / "gtm-container-export.json").read_text())["containerVersion"]
ACCOUNT, CONTAINER = OLD["accountId"], OLD["containerId"]
PUBLIC_ID = "GTM-NXPF7HTS"

ECOMMERCE = [
    ("view_item_list", "Shop listing viewed", "/shop"),
    ("select_item", "A product clicked in a list", "/shop"),
    ("view_item", "Product page viewed", "/shop/{product}"),
    ("add_to_wishlist", "Wishlist button", "/shop/{product}"),
    ("add_to_cart", "Add to cart, or + in the cart", "/shop/{product}, /shop/cart"),
    ("remove_from_cart", "− or Remove in the cart", "/shop/cart"),
    ("view_cart", "Cart viewed", "/shop/cart"),
    ("begin_checkout", "Checkout opened", "/shop/checkout"),
    ("add_shipping_info", "Delivery chosen (skipped when the cart is all digital)", "/shop/checkout"),
    ("add_payment_info", "Payment attempted (card, Apple Pay, Google Pay)", "/shop/checkout"),
    ("purchase", "Order confirmed. Fires once per order; reload-safe", "/shop/order"),
    ("refund", "Refund requested", "/shop/orders"),
    ("view_promotion", "CONSENT10 promo seen", "/shop"),
    ("select_promotion", "CONSENT10 promo clicked", "/shop"),
]

# event, when it fires, where, [params]
CUSTOM = [
    ("search", "Site search submitted (Enter)", "All pages", ["search_term"]),
    ("post_click", "Previous edition card clicked", "Home, editions", ["post_id", "content_group"]),
    ("newsletter_like", "Like / unlike an edition", "Home, editions", ["item_id", "like_action"]),
    ("comment_submit", "Comment posted (never the text or email)", "Home, editions", ["item_id", "comment_status"]),
    ("share", "Share button (GA4 recommended event)", "Home, editions", ["method", "content_type", "item_id"]),
    ("project_expand", "A tool card opened", "/whats-cooking", ["item_id"]),
    ("project_filter", "Status filter used", "/whats-cooking", ["filter_status"]),
    ("roadmap_section_toggle", "A Roadmap section opened or closed", "/roadmap", ["section_name", "section_open"]),
    ("roadmap_item_click", "A task, recap link or kanban card clicked through to its product", "/roadmap", ["link_location", "item_id"]),
    ("consent_update", "Cookie choice made or reloaded", "All pages", ["consent_analytics", "consent_marketing", "consent_source"]),
    ("web_vitals", "Core Web Vitals (only with analytics consent)", "All pages", ["metric_name", "metric_value", "metric_rating"]),
    ("welcome_back", "Returning-visitor greeting shown", "All pages", ["visit_count", "day_part"]),
    ("datalayer_viewer_open", "dataLayer viewer opened", "All pages", []),
    ("psych_reveal", "'Sike!' reveal on coffee / tip jar", "/shop/{product}", ["item_id", "item_name"]),
    ("coupon_apply", "Valid coupon applied", "/shop/checkout", ["coupon"]),
    ("coupon_error", "Invalid coupon (try BADUTM)", "/shop/checkout", ["coupon", "error_reason"]),
    ("payment_failed", "Declined, expired, failed verification or cancelled wallet", "/shop/checkout", ["payment_type", "failure_reason", "value", "currency"]),
    ("payment_verification", "Pretend 3-D Secure answered", "/shop/checkout", ["payment_type", "verification_result"]),
    ("form_submit", "Test sign-up form submitted (hashed email only)", "/form-test", ["form_id", "form_name", "commitment_level"]),
]
GLOBAL = ["test_store"]   # sent with every event when present
ECOM_EXTRA = ["adopted_event"]          # custom item-level detail on add_to_cart for "Adopt a Rogue Event"

PARAMS = {
    "search_term": ("Text typed into site search", "event"), "post_id": ("Edition slug, e.g. 2026-08", "event"),
    "content_group": ("newsletter", "event"), "item_id": ("Edition slug, tool slug or product id", "event"),
    "like_action": ("like / unlike", "event"), "comment_status": ("published / pending", "event"),
    "method": ("native / copy_link", "event"), "content_type": ("newsletter", "event"),
    "filter_status": ("all / done / drafted / blocked / …", "event"), "consent_analytics": ("true / false", "event"),
    "consent_marketing": ("true / false", "event"), "consent_source": ("stored / banner_accept / banner_essential / privacy_page", "event"),
    "metric_name": ("LCP / INP / CLS / FCP / TTFB", "event"), "metric_value": ("ms (CLS × 1000)", "event"),
    "metric_rating": ("good / needs-improvement / poor", "event"), "visit_count": ("Number of visits in this browser", "event"),
    "day_part": ("morning / midday / afternoon / evening / night", "event"),
    "item_name": ("Product name", "event"), "coupon": ("Coupon code", "event"), "error_reason": ("unknown_code / invalid_code", "event"),
    "payment_type": ("credit_card / apple_pay / google_pay", "event"),
    "failure_reason": ("card_declined / expired_card / verification_failed / wallet_cancelled", "event"),
    "value": ("Order value", "event"), "currency": ("NZD", "event"), "verification_result": ("pass / fail", "event"),
    "form_id": ("society_join_form", "event"), "form_name": ("Form name", "event"), "commitment_level": ("Sign-up form choice", "event"),
    "test_store": ("true on every shop and test event", "event"),
    "adopted_event": ("The event name adopted in the shop", "event"),
    "section_name": ("recap / matrix / kanban", "event"), "section_open": ("true / false", "event"),
    "link_location": ("matrix / matrix_key / kanban / recap", "event"),
}


def t(k, v): return {"type": "TEMPLATE", "key": k, "value": v}
def row(p, v): return {"type": "MAP", "map": [t("parameter", p), t("parameterValue", v)]}
def base(**kw): return {"accountId": ACCOUNT, "containerId": CONTAINER, **kw}


def build_container():
    custom_params = sorted({p for _, _, _, ps in CUSTOM for p in ps} | set(GLOBAL) | set(ECOM_EXTRA))
    variables = [base(variableId="1", name="CONST - GA4 Measurement ID", type="c", parameter=[t("value", "G-XXXXXXXXXX")])]
    for i, p in enumerate(custom_params, start=2):
        variables.append(base(variableId=str(i), name=f"DLV - {p}", type="v", parameter=[
            {"type": "INTEGER", "key": "dataLayerVersion", "value": "2"},
            {"type": "BOOLEAN", "key": "setDefaultValue", "value": "false"}, t("name", p)]))

    def ce(tid, name, events):
        return base(triggerId=tid, name=name, type="CUSTOM_EVENT", customEventFilter=[{"type": "MATCH_REGEX", "parameter": [
            t("arg0", "{{_event}}"), t("arg1", "^(" + "|".join(events) + ")$")]}])
    triggers = [ce("100", "CE - GA4 ecommerce events", [e for e, _, _ in ECOMMERCE]),
                ce("101", "CE - site custom events", [e for e, _, _, _ in CUSTOM])]

    common = dict(tagFiringOption="ONCE_PER_EVENT", monitoringMetadata={"type": "MAP"}, consentSettings={"consentStatus": "NOT_SET"})
    tags = [
        base(tagId="10", name="GA4 - Google tag", type="googtag", parameter=[t("tagId", "{{CONST - GA4 Measurement ID}}")],
             firingTriggerId=["2147479573"], **common),
        base(tagId="11", name="GA4 - Ecommerce events", type="gaawe", parameter=[
            t("eventName", "{{Event}}"), t("measurementIdOverride", "{{CONST - GA4 Measurement ID}}"),
            {"type": "BOOLEAN", "key": "sendEcommerceData", "value": "true"}, t("getEcommerceDataFrom", "dataLayer"),
            {"type": "LIST", "key": "eventSettingsTable", "list": [row(p, "{{DLV - " + p + "}}") for p in GLOBAL + ECOM_EXTRA]}],
            firingTriggerId=["100"], **common),
        base(tagId="12", name="GA4 - Site custom events", type="gaawe", parameter=[
            t("eventName", "{{Event}}"), t("measurementIdOverride", "{{CONST - GA4 Measurement ID}}"),
            {"type": "BOOLEAN", "key": "sendEcommerceData", "value": "false"},
            {"type": "LIST", "key": "eventSettingsTable", "list": [row(p, "{{DLV - " + p + "}}") for p in custom_params if p not in ECOM_EXTRA]}],
            firingTriggerId=["101"], **common),
    ]
    return {"exportFormatVersion": 2, "exportTime": "2026-11-03 13:30:00", "containerVersion": {
        "path": f"accounts/{ACCOUNT}/containers/{CONTAINER}/versions/0", "accountId": ACCOUNT, "containerId": CONTAINER,
        "containerVersionId": "0", "container": {"path": f"accounts/{ACCOUNT}/containers/{CONTAINER}", "accountId": ACCOUNT,
        "containerId": CONTAINER, "name": "debbie.nz", "publicId": PUBLIC_ID, "usageContext": ["WEB"]},
        "tag": tags, "trigger": triggers, "variable": variables,
        "builtInVariable": [base(type="EVENT", name="Event")]}}


def build_doc():
    L = ["# debbie.nz — Tracking plan and data dictionary (v5.2)", "",
         "Generated by `scripts/make_gtm.py` — edit the lists in that script, then re-run it. It also regenerates",
         "`gtm-container-export.json`, so the plan and the GTM container always match.", "",
         "**Everything here is test data.** Shop and test-bench events carry `test_store: true`. Filter that out of real reporting.", "",
         "Consent: `/consent.js` loads before GTM and sets Google Consent Mode v2 defaults to *denied* until the visitor chooses.", "",
         "## GA4 recommended ecommerce events", "", "| Event | Fires when | Where |", "|---|---|---|"]
    L += [f"| `{e}` | {w} | `{p}` |" for e, w, p in ECOMMERCE]
    L += ["", "All ecommerce events: `ecommerce.currency` (NZD), `ecommerce.value`, `ecommerce.items[]` with `item_id`, `item_name`,",
          "`item_brand`, `affiliation`, `item_category`, `item_category2`, `item_variant`, `price`, `quantity`, `index`",
          "(+ `item_list_id`/`item_list_name` on list events). `purchase`/`refund` add `transaction_id`, `tax` (GST 3/23), `shipping`;",
          "`purchase` also `coupon`, `payment_type`, `shipping_tier`. `ecommerce: null` is pushed before each ecommerce event.",
          "With marketing consent, `purchase` includes `user_data.sha256_email_address` for enhanced conversions testing.", "",
          "## Custom events", "", "| Event | Fires when | Where | Parameters |", "|---|---|---|---|"]
    L += [f"| `{e}` | {w} | {p} | {', '.join('`' + x + '`' for x in ps) or '—'} |" for e, w, p, ps in CUSTOM]
    L += ["", "## Parameters (register as event-scoped custom dimensions in GA4)", "", "| Parameter | Values |", "|---|---|"]
    L += [f"| `{k}` | {v[0]} |" for k, v in sorted(PARAMS.items())]
    L += ["", "## Never in the dataLayer", "",
          "- Comment text, commenter emails, names, card numbers, CVCs, raw IP addresses.",
          "- The shop's checkout email is only ever pushed as a SHA-256 hash, and only with marketing consent.", "",
          "## Change log", "",
          "- **v5.2** — Roadmap tab events; chaos gremlin removed, so `chaos_start`, `chaos_end`, `chaos_mode` and `chaos_seconds` are retired.",
          "- **v5** — Full-site plan: test shop (GA4 ecommerce), dataLayer viewer, welcome back, web vitals; generated GTM container.",
          "- **v4** — Consent Mode v2 via `/consent.js`.",
          "- **v3** — Editions keyed by month; What's Cooking events.",
          "- **v2** — On the Pulse likes, comments, shares.", "- **v1** — Initial dictionary."]
    return "\n".join(L) + "\n"


(ROOT / "gtm-container-export.json").write_text(json.dumps(build_container(), indent=2))
(ROOT / "gtm-data-dictionary.md").write_text(build_doc())
print(f"Container: {len(ECOMMERCE)} ecommerce + {len(CUSTOM)} custom events → gtm-container-export.json; plan → gtm-data-dictionary.md")

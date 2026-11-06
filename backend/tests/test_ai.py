from app.logic.ai import AIUnavailable, Facts, check_draft, fill_price, run

PRICE = "₹14,42,045 on-road in Lucknow (valid till 31 Dec 2026)"


def facts(**kw):
    base = dict(lead_id=1, first_name="Rahul", lang="en", lead_type="enquiry", source="web",
                message="Looking for an automatic, budget around 14 lakh, want to buy before Diwali.",
                model="Model H", variant="ZX automatic", showroom="Gomti Nagar", consultant_first="Ankit",
                price_text=PRICE, used_car=None, test_drive=None)
    base.update(kw)
    return Facts(**base)


def good(**over):
    out = {"summary": "Wants an automatic SUV around 14 lakh before Diwali.", "intent": "hot", "timeframe": "before Diwali",
           "budget": "around 14 lakh", "preferred_model": "Model H", "missing_info": ["trade-in?"], "confidence": 0.85,
           "why": "explicit budget and deadline",
           "draft": "Hi Rahul, thanks for asking about the Model H ZX automatic. It's {{PRICE}}. Can I book you a test drive this weekend? – Ankit"}
    out.update(over)
    return lambda f: out


# the happy path


def test_good_answer_gets_the_official_price_filled_in():
    r = run(facts(), caller=good())
    assert r.status == "ok"
    assert PRICE in r.draft and "{{PRICE}}" not in r.draft
    assert r.summary["intent"] == "hot"


# when the model is wrong


def test_discount_in_draft_is_rejected_but_read_is_kept():
    r = run(facts(), caller=good(draft="Hi Rahul, we have a Diwali offer with extra discount on the Model H! – Ankit"))
    assert r.status == "needs_review"
    assert "discount" not in r.draft.lower() and "offer" not in r.draft.lower()
    assert r.summary["budget"] == "around 14 lakh"
    assert any("discount" in p for p in r.problems)


def test_model_writing_its_own_price_is_rejected():
    for bad in ["It's just ₹13,99,000 on-road!", "Only 13.9 lakh on-road", "Price is Rs 1399000", "EMI starts low"]:
        r = run(facts(), caller=good(draft=f"Hi Rahul, {bad} – Ankit"))
        assert r.status == "needs_review", bad
        assert any("price" in p for p in r.problems), bad


def test_hindi_discount_words_caught():
    assert check_draft("नमस्ते राहुल, दिवाली पर ख़ास छूट है।", "hi") == ["mentions a discount or offer"]


def test_wrong_language_is_flagged():
    r = run(facts(lang="hi"), caller=good())
    assert r.status == "needs_review" and any("hindi" in p for p in r.problems)
    # and the safe template is in hindi
    assert "नमस्ते" in r.draft


def test_unknown_placeholder_and_links_flagged():
    assert "unknown placeholder" in check_draft("Hi {{NAME}}, see you", "en")
    assert "contains a link" in check_draft("Hi, see https://example.com", "en")


def test_low_confidence_is_needs_review_with_draft_kept():
    r = run(facts(message=""), caller=good(confidence=0.3, intent="cold"))
    assert r.status == "needs_review" and r.problems == ["ai isn't sure about this one"]
    assert r.draft.startswith("Hi Rahul")


def test_junk_fields_are_cleaned_not_trusted():
    r = run(facts(), caller=good(intent="extremely hot", confidence="very", missing_info="none"))
    assert r.summary["intent"] is None and r.summary["confidence"] == 0.0 and r.summary["missing_info"] == []


# when the model isn't there


def test_unavailable_falls_back_to_template_and_rules():
    def down(f):
        raise AIUnavailable("timed out")

    r = run(facts(), caller=down)
    assert r.status == "fallback"
    assert r.summary["budget"].startswith("14 lakh") and r.summary["intent"] == "hot"
    assert "AI unavailable (timed out)" in r.summary["why"]
    assert PRICE in r.draft and check_draft(r.draft.replace(PRICE, "{{PRICE}}"), "en") == []


def test_crash_never_escapes():
    def boom(f):
        raise KeyError("surprise")

    assert run(facts(), caller=boom).status == "fallback"


def test_no_api_key_is_a_fallback_not_an_error():
    # tests run without ANTHROPIC_API_KEY
    assert run(facts()).status == "fallback"


def test_templates_pass_our_own_rules():
    for lang in ("en", "hi"):
        for f in (facts(lang=lang), facts(lang=lang, test_drive="Sat 7 Nov, 11:00 am"),
                  facts(lang=lang, used_car="2022 Model C VX", price_text=None)):
            r = run(f, caller=lambda _: (_ for _ in ()).throw(AIUnavailable("x")))
            assert check_draft(r.draft.replace(PRICE, "{{PRICE}}"), lang) == [], (lang, r.draft)


def test_no_price_rule_means_no_number():
    assert fill_price("It's {{PRICE}}.", None, "en") == "It's the full on-road price breakup."

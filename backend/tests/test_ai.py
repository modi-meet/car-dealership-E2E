import httpx2
import pytest


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


# gemini, with a fake client so no network


class FakeGemini:
    # stands in for genai.Client, hands back whatever the test set up
    def __init__(self, answer=None, error=None):
        self.answer, self.error, self.seen = answer, error, {}

    def __call__(self, **kw):
        self.seen["client"] = kw
        return self

    @property
    def models(self):
        return self

    def generate_content(self, **kw):
        self.seen["call"] = kw
        if self.error:
            raise self.error
        return self.answer


def gemini_answer(text, reason="STOP", blocked=None):
    from types import SimpleNamespace as NS

    from google.genai import types

    return NS(text=text, prompt_feedback=NS(block_reason=blocked) if blocked else None,
              candidates=[NS(finish_reason=types.FinishReason[reason])])


@pytest.fixture
def gemini(monkeypatch):
    from app.logic import ai

    monkeypatch.setattr(ai.settings, "anthropic_api_key", None)
    monkeypatch.setattr(ai.settings, "gemini_api_key", "test-key")

    def use(fake):
        monkeypatch.setattr(ai.genai, "Client", fake)
        return fake

    return use


def test_gemini_good_answer_goes_through_the_same_checks(gemini):
    import json

    fake = gemini(FakeGemini(gemini_answer(json.dumps(good()(None)))))
    r = run(facts())
    assert r.status == "ok" and PRICE in r.draft
    cfg = fake.seen["call"]["config"]
    assert cfg.response_mime_type == "application/json" and "additionalProperties" not in cfg.response_json_schema
    assert "<buyer_message>" in fake.seen["call"]["contents"]


def test_gemini_draft_with_discount_still_rejected(gemini):
    import json

    gemini(FakeGemini(gemini_answer(json.dumps(good(draft="Hi Rahul, there's a festive discount on now! – Ankit")(None)))))
    assert run(facts()).status == "needs_review"


@pytest.mark.parametrize("answer,why", [
    (lambda: gemini_answer("{}", reason="MAX_TOKENS"), "cut off"),
    (lambda: gemini_answer("", reason="SAFETY"), "declined"),
    (lambda: gemini_answer("", blocked="SAFETY"), "declined"),
    (lambda: gemini_answer("not json"), "valid json"),
])
def test_gemini_bad_answers_fall_back(gemini, answer, why):
    gemini(FakeGemini(answer()))
    r = run(facts())
    assert r.status == "fallback" and why in r.summary["why"]


def test_gemini_api_errors_fall_back(gemini):
    from google.genai import errors

    gemini(FakeGemini(error=errors.ClientError(429, {"error": {"message": "quota"}})))
    assert "rate limited" in run(facts()).summary["why"]
    gemini(FakeGemini(error=httpx2.ReadTimeout("slow")))
    assert "timed out" in run(facts()).summary["why"]


def test_claude_key_wins_when_both_are_set(gemini, monkeypatch):
    from app.logic import ai

    monkeypatch.setattr(ai.settings, "anthropic_api_key", "a-key")
    monkeypatch.setattr(ai, "call_claude", lambda f: good()(f))
    gemini(FakeGemini(error=AssertionError("gemini shouldn't be called")))
    assert ai.call_ai(facts())["intent"] == "hot"


def test_busy_gemini_tries_the_backup_model(gemini):
    import json

    from google.genai import errors

    class Busy(FakeGemini):
        def generate_content(self, **kw):
            self.seen.setdefault("models", []).append(kw["model"])
            if len(self.seen["models"]) == 1:
                raise errors.ServerError(503, {"error": {"message": "high demand"}})
            return self.answer

    fake = gemini(Busy(gemini_answer(json.dumps(good()(None)))))
    assert run(facts()).status == "ok"
    assert fake.seen["models"] == ["gemini-flash-latest", "gemini-flash-lite-latest"]


def test_slow_gemini_also_tries_the_backup(gemini):
    import json

    from google.genai import errors

    class Slow(FakeGemini):
        def generate_content(self, **kw):
            self.seen.setdefault("models", []).append(kw["model"])
            if len(self.seen["models"]) == 1:
                raise errors.ServerError(504, {"error": {"message": "deadline expired"}})
            return self.answer

    fake = gemini(Slow(gemini_answer(json.dumps(good()(None)))))
    assert run(facts()).status == "ok" and len(fake.seen["models"]) == 2


def test_both_gemini_models_busy_falls_back(gemini):
    from google.genai import errors

    gemini(FakeGemini(error=errors.ServerError(503, {"error": {"message": "high demand"}})))
    assert "error 503" in run(facts()).summary["why"]

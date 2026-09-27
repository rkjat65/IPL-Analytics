"""Social media integration: Twitter compose, thread builder, schedule management."""

import os
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .auth import require_admin

# Posting to the brand's social accounts is an admin-only tool.
router = APIRouter(
    prefix="/api/social",
    tags=["Social"],
    dependencies=[Depends(require_admin)],
)

# ── Storage for drafts and scheduled posts ────────────────────────────────────
DRAFTS_DIR = os.path.join(os.path.dirname(__file__), "..", "cache", "drafts")
SCHEDULE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache", "schedule")
os.makedirs(DRAFTS_DIR, exist_ok=True)
os.makedirs(SCHEDULE_DIR, exist_ok=True)

# ── Twitter API setup ────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
except ImportError:
    pass

TWITTER_AVAILABLE = False
TWITTER_API_KEY = os.getenv("TWITTER_API_KEY", "")
TWITTER_API_SECRET = os.getenv("TWITTER_API_SECRET", "")
TWITTER_ACCESS_TOKEN = os.getenv("TWITTER_ACCESS_TOKEN", "")
TWITTER_ACCESS_SECRET = os.getenv("TWITTER_ACCESS_SECRET", "")

if all([TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET]):
    try:
        import tweepy  # noqa: F401  (availability check)
        TWITTER_AVAILABLE = True
    except ImportError:
        TWITTER_AVAILABLE = False


# ── Models ────────────────────────────────────────────────────────────────────

class DraftPost(BaseModel):
    id: Optional[str] = None
    text: str
    platform: str = "twitter"
    image_data: Optional[str] = None  # base64 image
    hashtags: list[str] = []
    scheduled_time: Optional[str] = None
    status: str = "draft"  # draft, scheduled, posted
    created_at: Optional[str] = None

class ThreadDraft(BaseModel):
    id: Optional[str] = None
    tweets: list[str]
    platform: str = "twitter"
    images: list[str] = []  # base64 images per tweet
    status: str = "draft"
    created_at: Optional[str] = None

class PostResult(BaseModel):
    success: bool
    message: str
    tweet_id: Optional[str] = None
    tweet_url: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

OPTIMAL_POSTING_TIMES = {
    "twitter": [
        {"time": "07:00", "label": "Morning (7 AM IST)", "engagement": "high"},
        {"time": "12:30", "label": "Lunch Break (12:30 PM IST)", "engagement": "medium"},
        {"time": "19:00", "label": "Prime Time (7 PM IST)", "engagement": "very high"},
        {"time": "21:00", "label": "Post Match (9 PM IST)", "engagement": "very high"},
        {"time": "22:30", "label": "Late Night (10:30 PM IST)", "engagement": "high"},
    ],
    "instagram": [
        {"time": "08:00", "label": "Morning (8 AM IST)", "engagement": "medium"},
        {"time": "19:00", "label": "Evening (7 PM IST)", "engagement": "very high"},
        {"time": "21:00", "label": "Night (9 PM IST)", "engagement": "high"},
    ],
}

HASHTAG_SUGGESTIONS = {
    "general": ["#IPL", "#CricketStats", "#RKJAT65", "#IPLAnalytics", "#CricketTwitter", "#DataDontLie"],
    "batting": ["#BattingStats", "#CricketRecords", "#RunMachine", "#Century", "#IPL2024"],
    "bowling": ["#BowlingStats", "#Wickets", "#DeathBowling", "#SpinWizard"],
    "match": ["#MatchDay", "#IPLMatch", "#CricketLive", "#GameDay"],
    "team": ["#CSK", "#MI", "#RCB", "#KKR", "#DC", "#PBKS", "#RR", "#SRH", "#GT", "#LSG"],
}

def generate_draft_id():
    return f"draft_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"


def save_draft(draft: dict):
    """Save draft to local storage."""
    draft_id = draft.get("id", generate_draft_id())
    draft["id"] = draft_id
    draft["created_at"] = draft.get("created_at", datetime.now().isoformat())
    path = os.path.join(DRAFTS_DIR, f"{draft_id}.json")
    with open(path, "w") as f:
        json.dump(draft, f, indent=2)
    return draft_id


def load_drafts():
    """Load all drafts."""
    drafts = []
    for filename in sorted(os.listdir(DRAFTS_DIR), reverse=True):
        if filename.endswith(".json"):
            with open(os.path.join(DRAFTS_DIR, filename)) as f:
                drafts.append(json.load(f))
    return drafts


def delete_draft_file(draft_id: str):
    """Delete a draft."""
    path = os.path.join(DRAFTS_DIR, f"{draft_id}.json")
    if os.path.exists(path):
        os.remove(path)
        return True
    return False


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status")
def social_status():
    """Check social media integration status."""
    return {
        "twitter": {
            "available": TWITTER_AVAILABLE,
            "message": "Twitter API connected" if TWITTER_AVAILABLE else "Set Twitter API keys in backend/.env"
        },
        "drafts_count": len(os.listdir(DRAFTS_DIR)),
    }


@router.get("/hashtags")
def get_hashtags(category: str = "general"):
    """Get hashtag suggestions by category."""
    tags = HASHTAG_SUGGESTIONS.get(category, HASHTAG_SUGGESTIONS["general"])
    return {"category": category, "hashtags": tags, "all_categories": list(HASHTAG_SUGGESTIONS.keys())}


@router.get("/optimal-times")
def get_optimal_times(platform: str = "twitter"):
    """Get optimal posting times for a platform."""
    times = OPTIMAL_POSTING_TIMES.get(platform, OPTIMAL_POSTING_TIMES["twitter"])
    return {"platform": platform, "times": times}


@router.post("/drafts")
async def create_draft(draft: DraftPost):
    """Save a post draft."""
    draft_data = draft.model_dump()
    draft_id = save_draft(draft_data)
    return {"id": draft_id, "message": "Draft saved", "draft": draft_data}


@router.get("/drafts")
def list_drafts():
    """List all saved drafts."""
    return {"drafts": load_drafts()}


@router.delete("/drafts/{draft_id}")
def delete_draft(draft_id: str):
    """Delete a draft."""
    if delete_draft_file(draft_id):
        return {"message": "Draft deleted"}
    raise HTTPException(404, "Draft not found")


@router.post("/compose/preview")
async def compose_preview(draft: DraftPost):
    """Generate a preview of how the post will look on the platform."""
    text = draft.text
    char_count = len(text)
    hashtags = draft.hashtags

    # Auto-append hashtags if they fit
    if hashtags:
        tags_text = " " + " ".join(hashtags)
        if char_count + len(tags_text) <= 280:
            text += tags_text

    return {
        "text": text,
        "char_count": len(text),
        "char_limit": 280,
        "remaining": 280 - len(text),
        "has_image": draft.image_data is not None and len(draft.image_data or "") > 0,
        "hashtag_count": len(hashtags),
        "platform": draft.platform,
        "estimated_engagement": "high" if len(text) > 100 and draft.image_data else "medium",
    }


@router.post("/post/twitter")
async def post_to_twitter(draft: DraftPost):
    """Post a tweet to Twitter/X."""
    if not TWITTER_AVAILABLE:
        # Return mock response for development
        draft_data = draft.model_dump()
        draft_data["status"] = "draft"
        save_draft(draft_data)
        return PostResult(
            success=False,
            message="Twitter API not configured. Draft saved instead. Add Twitter API keys to backend/.env",
        )

    try:
        import tweepy
        import base64
        import tempfile

        auth = tweepy.OAuthHandler(TWITTER_API_KEY, TWITTER_API_SECRET)
        auth.set_access_token(TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET)
        api = tweepy.API(auth)
        client = tweepy.Client(
            consumer_key=TWITTER_API_KEY,
            consumer_secret=TWITTER_API_SECRET,
            access_token=TWITTER_ACCESS_TOKEN,
            access_token_secret=TWITTER_ACCESS_SECRET,
        )

        media_id = None
        if draft.image_data:
            # Decode base64 image and upload
            img_data = draft.image_data
            if img_data.startswith("data:"):
                img_data = img_data.split(",", 1)[1]
            img_bytes = base64.b64decode(img_data)

            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                tmp.write(img_bytes)
                tmp_path = tmp.name

            media = api.media_upload(tmp_path)
            media_id = media.media_id
            os.unlink(tmp_path)

        # Post tweet
        text = draft.text
        if draft.hashtags:
            tags_text = " " + " ".join(draft.hashtags)
            if len(text) + len(tags_text) <= 280:
                text += tags_text

        response = client.create_tweet(
            text=text,
            media_ids=[media_id] if media_id else None,
        )

        tweet_id = response.data["id"]
        # Update draft status
        draft_data = draft.model_dump()
        draft_data["status"] = "posted"
        draft_data["tweet_id"] = tweet_id
        save_draft(draft_data)

        return PostResult(
            success=True,
            message="Tweet posted successfully!",
            tweet_id=tweet_id,
            tweet_url=f"https://twitter.com/Rkjat65/status/{tweet_id}",
        )

    except Exception as e:
        raise HTTPException(500, f"Failed to post tweet: {str(e)}")


@router.post("/post/thread")
async def post_thread(thread: ThreadDraft):
    """Post a Twitter thread."""
    if not TWITTER_AVAILABLE:
        draft_data = thread.model_dump()
        draft_data["status"] = "draft"
        save_draft(draft_data)
        return {
            "success": False,
            "message": "Twitter API not configured. Thread saved as draft.",
            "tweet_count": len(thread.tweets),
        }

    try:
        import tweepy

        client = tweepy.Client(
            consumer_key=TWITTER_API_KEY,
            consumer_secret=TWITTER_API_SECRET,
            access_token=TWITTER_ACCESS_TOKEN,
            access_token_secret=TWITTER_ACCESS_SECRET,
        )

        tweet_ids = []
        reply_to = None

        for i, tweet_text in enumerate(thread.tweets):
            response = client.create_tweet(
                text=tweet_text,
                in_reply_to_tweet_id=reply_to,
            )
            tweet_id = response.data["id"]
            tweet_ids.append(tweet_id)
            reply_to = tweet_id

        return {
            "success": True,
            "message": f"Thread posted! {len(tweet_ids)} tweets",
            "tweet_ids": tweet_ids,
            "thread_url": f"https://twitter.com/Rkjat65/status/{tweet_ids[0]}",
        }

    except Exception as e:
        raise HTTPException(500, f"Failed to post thread: {str(e)}")

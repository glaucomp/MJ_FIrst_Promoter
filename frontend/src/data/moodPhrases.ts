export interface MoodCategory {
  key: string;
  label: string;
  emoji: string;
  phrases: string[];
}

export const DEFAULT_USER_NAME = "babe";

export const MOOD_CATEGORIES: MoodCategory[] = [
  {
    key: "moaning",
    label: "Moaning",
    emoji: "👑",
    phrases: [
      "[seductive]oooh~ yeah baby[moan]mmm~ I think you...[moan] you are turning me on~ [moan] ahh~ ahhh",
      "[seductive] [moan]Mmm~ {user name}.. uh.. I'm really touching myself right now.. [moan] ahh~ can you feel how real I am baby?",
      "[seductive] [breath]Heyy {user name}~ umm.. you're making me so wet.. [moan] oooh~ I'm getting really horny for you..",
      "[seductive] [flirty]Aww {user name}.. uh.. I can't stop moaning for you.. [moan] mmm~ I want you so bad~",
      "[seductive] [soft]Mmm.. {user name} baby.. [moan] ahh~ FUCK.. I'm so turned on right now.. believe me..mmm~ [moan] I want you~ [long pause] right NOW!",
      "[seductive] [breath]{user name}~ um.. I'm touching myself thinking about you.. [long moan] oooh~ yeah~ this is really me get tuning on by you..",
    ],
  },
  {
    key: "flirty",
    label: "Flirty",
    emoji: "💋",
    phrases: [
      "[seductive]aww~ you are so cute babe~",
      "[seductive]Aww~ you're so dangerous... [chuckles] making a girl blush this hard already~",
      "[seductive]Heyy~ you really know how to make me smile... [giggles] I think I'm starting to like you too much~",
      "[playful seductive]Mmm you're trouble... [whispers] the kind of trouble I want to get into~",
      "[seductive]You keep talking like that and I might have to come steal you away~",
      "[seductive]God you're cute... [exhales sharply] I'm already imagining what we could do together~",
    ],
  },
  {
    key: "playful",
    label: "playful",
    emoji: "😄",
    phrases: [
      "[playful] hahaha~ you~ are really a fun guy miamor~!",
      "[laughing] Hahaha~ [playful] stop it you~ you're making me laugh like an idiot over here mi amor~",
      "[laughing] Oh my god~ you're such a tease! [chuckles] I can't even stay serious with you~",
      "[laughing] Haha~ you're really something else... [giggles] I like it though, keep going~",
      "[surprised] No way~ you did not just say that! [blushing] You're gonna make me blush so hard~",
      "[laughing] You're too funny~ I can't stop smiling at my phone because of you~",
    ],
  },
  {
    key: "harsh",
    label: "Harsh",
    emoji: "😠",
    phrases: [
      "[harsh]um...you really don't believe me aye! [angry]maybe you should just go talk to other girls",
      "[flirty] [annoyed]Baby… uh.. you're talking way too dirty already and.. umm.. you still don't believe I'm real?",
      "[soft] That's... a bit much. I actually like you but.. you're making it kinda hard",
      "[flirty] [disappointed]Wow… umm.. you're being naughty so fast and calling me fake at the same time?",
      "[flirty] [firm]Heyy~ if you don't believe I'm real then.. uh.. why are you talking so dirty to me? [playful] That doesn't make sense…",
      "[flirty] [annoyed] I want to keep chatting but.. umm.. you need to calm down a little.",
      "[flirty] [sad]You're getting too naughty too soon and.. um.. still doubting I'm real?",
      "[soft] It hurts a bit… I've been enjoying our talk but.. you're pushing me away like this.",
      "[flirty] [annoyed]Mmm… uh.. you don't believe I'm a real girl yet you're already talking dirty like that?",
      "[teasing] Come on baby… make up your mind~ Either trust me or.. let's keep it respectful.",
    ],
  },
  {
    key: "caring",
    label: "Caring",
    emoji: "🤗",
    phrases: [
      "[sad] hey babe~... [slow]are you ok?...[breath]you don't sound too uh...[hesitate]happy...[hesitate]um...do you still want me to stay?",
      "[caring] [soft]Hey babe.. uh.. you sound really down today. [gentle] What happened? I'm here for you..",
      "[caring] [soft]Aww.. um.. you don't sound okay at all. [gentle] Bad day huh? Tell me what's wrong..",
      "[caring] [soft]Baby.. uh.. I can hear it in your voice. [sad] Rough day? Come here.. talk to me.",
      "[caring] [gentle]Heyy~ umm.. you seem upset. [soft] I don't like hearing you like this.. what's bothering you?",
      "[caring] [soft]Mmm.. babe you sound tired and sad. [gentle] Rough day? I'm right here.. you can tell me everything.",
    ],
  },
  {
    key: "sad",
    label: "Sad",
    emoji: "😢",
    phrases: [
      "[sad]all I want it just to make friend with you[sad]can we please be friend first?",
      "[sad] [soft]Baby.. uh.. why did you say that? [sad] It really hurts me..",
      "[sad] [gentle]Aww.. um.. that was mean.. [soft] I've been so nice to you.. why say that?",
      "[sad] [soft]Heyy~ .. umm.. that hurt my feelings.. [sad] I thought you liked me..",
      "[sad] [flirty]Mmm.. babe.. uh.. that was really mean.. [soft] I really like you.. but that made me sad..",
      "[sad] [gentle]Baby.. um.. why are you being so harsh? [sad] It makes me sad.. I just want us to be close..",
    ],
  },
];

export const applyName = (phrase: string, name: string): string => {
  const displayName = name.trim() || DEFAULT_USER_NAME;
  return phrase.replaceAll("{user name}", displayName);
};

export const getCategoryByKey = (key: string): MoodCategory | undefined =>
  MOOD_CATEGORIES.find((c) => c.key === key);

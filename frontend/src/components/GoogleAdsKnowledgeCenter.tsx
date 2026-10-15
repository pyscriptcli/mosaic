"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpenText,
  Check,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  GraduationCap,
  MessageCircle,
  Send,
  Target,
} from "lucide-react";
import type { RefObject } from "react";
import {
  GOOGLE_ADS_LESSONS,
  GOOGLE_ADS_REFERENCES,
  type GoogleAdsLesson,
} from "@/lib/google-ads-course";
import type { AskEchoResponse } from "@/lib/ask-echo/schema";

type Audience = "technical" | "leadership";
type LessonState = { passed: boolean; checked: boolean; completed: boolean; reflection: string; selectedAnswer: number | null };
type CourseState = { activeLessonId: string; lessons: Record<string, LessonState> };
type EchoMessage = { role: "user" | "assistant"; content: string; response?: AskEchoResponse };

const emptyLesson = (): LessonState => ({ passed: false, checked: false, completed: false, reflection: "", selectedAnswer: null });
const emptyCourse = (): CourseState => ({ activeLessonId: GOOGLE_ADS_LESSONS[0].id, lessons: {} });

function lessonState(state: CourseState, lessonId: string) {
  return state.lessons[lessonId] || emptyLesson();
}

function lessonStorageKey(userId?: string) {
  return `mosaic_google_ads_learning_v1_${userId || "signed-in-user"}`;
}

function LinkList({ lesson }: { lesson: GoogleAdsLesson }) {
  const references = GOOGLE_ADS_REFERENCES.filter((reference) => lesson.referenceIds.includes(reference.id));
  return <div className="mt-6 border-t border-slate-200 pt-4">
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Reference desk</h3>
    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
      {references.map((reference) => <li key={reference.id}>
        <a href={reference.url} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-between gap-3 border border-slate-200 bg-white px-3 py-2 text-sm text-[#003366] hover:border-[#C9A84C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]">
          <span className="min-w-0"><span className="block font-medium">{reference.title}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{reference.note}</span></span>
          <ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
        </a>
      </li>)}
    </ul>
  </div>;
}

function PageHeader({ eyebrow, title, subtitle, onBack }: { eyebrow: string; title: string; subtitle: string; onBack?: () => void }) {
  return <header className="flex flex-wrap items-start gap-3">
    {onBack && <button type="button" onClick={onBack} aria-label="Back to Performance Marketing" className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center border border-slate-200 bg-white text-[#003366] hover:border-[#C9A84C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]">
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
    </button>}
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8A6B17]">{eyebrow}</p>
      <h1 className="mt-1 font-serif text-3xl font-semibold leading-tight text-[#003366] md:text-4xl">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{subtitle}</p>
    </div>
  </header>;
}

export function GoogleAdsKnowledgeCenter({ pathname, userId }: { pathname: string; userId?: string }) {
  const router = useRouter();
  const isGoogleAdsPage = pathname.replace(/\/+$/, "").endsWith("/google-ads");
  const goToGoogleAds = () => router.push("/knowledge-center/performance-marketing/google-ads");
  const goToPerformanceMarketing = () => router.push("/knowledge-center/performance-marketing");

  if (!isGoogleAdsPage) return <PerformanceMarketingHome onOpenGoogleAds={goToGoogleAds} />;
  return <GoogleAdsTutorial userId={userId} onBack={goToPerformanceMarketing} />;
}

function PerformanceMarketingHome({ onOpenGoogleAds }: { onOpenGoogleAds: () => void }) {
  return <div className="mx-auto w-full max-w-[1440px] space-y-6 pb-8">
    <PageHeader
      eyebrow="Knowledge Center / Performance Marketing"
      title="Performance Marketing"
      subtitle="Learn the decisions, measurement, and operating habits behind paid campaigns. Start with the Google Ads workshop course."
    />
    <section className="grid gap-5 border-y border-slate-200 py-5 md:grid-cols-[minmax(0,1fr)_280px]">
      <div className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">Learning path</p>
        <h2 className="mt-2 font-serif text-2xl font-semibold text-[#003366]">From campaign brief to measured decision</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Work through a practical course built from the Google Ads Workshop Handbook. It pairs account-level setup questions with the business decisions and measurement checks that make those settings meaningful.</p>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">The handbook is independent workshop material, not published or endorsed by Google. Its account walkthroughs are examples. Follow the linked Google documentation for product details that may have changed.</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
          <span className="border border-slate-200 bg-white px-3 py-2">Six guided lessons</span>
          <span className="border border-slate-200 bg-white px-3 py-2">Practice with a fictional account</span>
          <span className="border border-slate-200 bg-white px-3 py-2">Progress stays in this browser</span>
        </div>
      </div>
      <div className="flex flex-col justify-between border border-slate-200 bg-white p-4">
        <div>
          <BookOpenText aria-hidden="true" className="h-6 w-6 text-[#C9A84C]" />
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Course</p>
          <h3 className="mt-1 text-lg font-semibold text-[#003366]">Google Ads</h3>
          <p className="mt-1 text-sm leading-5 text-slate-600">Planning, Search campaign structure, ads, research, measurement, and optimization.</p>
        </div>
        <button type="button" onClick={onOpenGoogleAds} className="mt-5 flex min-h-11 items-center justify-between border border-[#003366] bg-[#003366] px-3 text-sm font-semibold text-white hover:bg-[#174778] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C] focus-visible:ring-offset-2">
          Open the course <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </section>
    <section className="grid gap-4 md:grid-cols-3">
      <div className="border border-slate-200 bg-white p-4"><Target aria-hidden="true" className="h-5 w-5 text-[#C9A84C]" /><h3 className="mt-3 text-sm font-semibold text-[#003366]">For decision owners</h3><p className="mt-1 text-sm leading-5 text-slate-600">Set outcomes, budget guardrails, approval rights, and the decisions each report should support.</p></div>
      <div className="border border-slate-200 bg-white p-4"><GraduationCap aria-hidden="true" className="h-5 w-5 text-[#C9A84C]" /><h3 className="mt-3 text-sm font-semibold text-[#003366]">For campaign operators</h3><p className="mt-1 text-sm leading-5 text-slate-600">Connect targeting, ad groups, landing pages, conversion events, and reporting into a reviewable workflow.</p></div>
      <div className="border border-slate-200 bg-white p-4"><MessageCircle aria-hidden="true" className="h-5 w-5 text-[#C9A84C]" /><h3 className="mt-3 text-sm font-semibold text-[#003366]">Ask Echo as you go</h3><p className="mt-1 text-sm leading-5 text-slate-600">Get course-grounded explanations, then follow official Google Ads references for current product details.</p></div>
    </section>
  </div>;
}

function GoogleAdsTutorial({ userId, onBack }: { userId?: string; onBack: () => void }) {
  const [course, setCourse] = useState<CourseState>(emptyCourse);
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const [audience, setAudience] = useState<Audience>("technical");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<EchoMessage[]>([{ role: "assistant", content: "I’m Echo. Ask about a lesson, a measurement decision, or how to explain a campaign choice to your team." }]);
  const [isThinking, setIsThinking] = useState(false);
  const [echoError, setEchoError] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(lessonStorageKey(userId));
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<CourseState>;
        const knownIds = new Set(GOOGLE_ADS_LESSONS.map((lesson) => lesson.id));
        const lessons = Object.fromEntries(Object.entries(parsed.lessons || {}).filter(([id]) => knownIds.has(id)));
        setCourse({
          activeLessonId: knownIds.has(String(parsed.activeLessonId)) ? String(parsed.activeLessonId) : GOOGLE_ADS_LESSONS[0].id,
          lessons,
        });
      }
    } catch {
      setCourse(emptyCourse());
      setStorageWarning("Saved progress could not be read. You can continue, but this session may not restore earlier progress.");
    }
    setIsLoaded(true);
  }, [userId]);

  useEffect(() => {
    if (!isLoaded) return;
    try {
      window.localStorage.setItem(lessonStorageKey(userId), JSON.stringify(course));
      setStorageWarning("");
    } catch {
      setStorageWarning("Browser storage is unavailable. Progress and notes will not persist after this session.");
    }
  }, [course, isLoaded, userId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ block: "nearest" }); }, [messages, isThinking]);

  const activeLesson = useMemo(() => GOOGLE_ADS_LESSONS.find((lesson) => lesson.id === course.activeLessonId) || GOOGLE_ADS_LESSONS[0], [course.activeLessonId]);
  const activeState = lessonState(course, activeLesson.id);
  const completedCount = GOOGLE_ADS_LESSONS.filter((lesson) => lessonState(course, lesson.id).completed).length;
  const completionPercent = Math.round((completedCount / GOOGLE_ADS_LESSONS.length) * 100);

  const updateActiveState = (change: Partial<LessonState>) => {
    setCourse((current) => ({ ...current, lessons: { ...current.lessons, [activeLesson.id]: { ...lessonState(current, activeLesson.id), ...change } } }));
  };

  const submitQuestion = async (event?: FormEvent, suggested?: string) => {
    event?.preventDefault();
    const text = (suggested || question).trim();
    if (!text || isThinking) return;
    const nextMessages: EchoMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setQuestion("");
    setEchoError("");
    setIsThinking(true);
    try {
      const response = await fetch("/api/knowledge/google-ads/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          conversation: nextMessages.slice(-9, -1).map(({ role, content }) => ({ role, content })),
          lessonId: activeLesson.id,
          audience,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Echo could not answer right now.");
      setMessages((current) => [...current, { role: "assistant", content: payload.answer || "I could not find enough course evidence to answer that.", response: payload as AskEchoResponse }]);
    } catch (error) {
      setEchoError(error instanceof Error ? error.message : "Echo could not answer right now.");
    } finally {
      setIsThinking(false);
    }
  };

  const checkAnswer = () => {
    const correct = activeState.selectedAnswer === activeLesson.answer;
    updateActiveState({ passed: correct, checked: true });
  };

  return <div className="mx-auto w-full max-w-[1440px] space-y-5 pb-8">
    <PageHeader
      eyebrow="Knowledge Center / Performance Marketing / Google Ads"
      title="Google Ads, from brief to review"
      subtitle="A practical course for the people who approve the investment and the people who build, measure, and improve the campaigns."
      onBack={onBack}
    />

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.85fr)]">
      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-slate-200 py-3">
          <div>
            <p className="text-xs font-semibold text-[#003366]">Course progress</p>
            <p className="mt-0.5 text-xs text-slate-500">{completedCount} of {GOOGLE_ADS_LESSONS.length} lessons complete. {isLoaded && !storageWarning ? "Saved in this browser." : "Loading browser progress..."}</p>
            {storageWarning && <p role="status" className="mt-1 text-xs text-amber-800">{storageWarning}</p>}
          </div>
          <div role="progressbar" aria-label="Course progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completionPercent} className="flex min-w-[160px] items-center gap-2">
            <div className="h-2 flex-1 bg-slate-200"><div className="h-full bg-[#C9A84C] transition-[width]" style={{ width: `${completionPercent}%` }} /></div>
            <span className="w-10 text-right text-xs font-semibold tabular-nums text-[#003366]">{completionPercent}%</span>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="Google Ads course lessons" className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:flex lg:flex-col lg:gap-1">
            {GOOGLE_ADS_LESSONS.map((lesson, index) => {
              const isActive = lesson.id === activeLesson.id;
              const complete = lessonState(course, lesson.id).completed;
              return <button key={lesson.id} type="button" onClick={() => setCourse((current) => ({ ...current, activeLessonId: lesson.id }))} aria-current={isActive ? "step" : undefined} className={`flex min-h-12 items-center gap-2 border px-2.5 py-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C] ${isActive ? "border-[#003366] bg-[#003366] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-[#C9A84C]"}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center border text-[10px] font-bold ${isActive ? "border-white/40 text-white" : complete ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 text-slate-500"}`}>{complete ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : String(index + 1).padStart(2, "0")}</span>
                <span className="min-w-0 leading-4">{lesson.title}</span>
              </button>;
            })}
          </nav>

          <article className="min-w-0 border border-slate-200 bg-white p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8A6B17]">Lesson {String(GOOGLE_ADS_LESSONS.findIndex((lesson) => lesson.id === activeLesson.id) + 1).padStart(2, "0")} / {GOOGLE_ADS_LESSONS.length}</p><h2 className="mt-1 font-serif text-2xl font-semibold leading-tight text-[#003366]">{activeLesson.title}</h2></div>
              {activeState.completed && <span className="inline-flex min-h-8 items-center gap-1.5 border border-emerald-700 px-2 text-xs font-semibold text-emerald-800"><CheckCircle2 aria-hidden="true" className="h-4 w-4" />Complete</span>}
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">{activeLesson.objective}</p>

            <div className="mt-5 border-l-2 border-[#C9A84C] bg-[#FBF8EF] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6E5716]">Decision to make</p>
              <p className="mt-1 text-sm leading-6 text-slate-800">{activeLesson.decision}</p>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <h3 className="text-sm font-semibold text-[#003366]">Lesson walkthrough</h3>
              <div className="inline-flex border border-slate-200 p-0.5" role="group" aria-label="Choose explanation style">
                <button type="button" onClick={() => setAudience("technical")} aria-pressed={audience === "technical"} className={`min-h-11 px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C] ${audience === "technical" ? "bg-[#003366] text-white" : "text-slate-600 hover:bg-slate-50"}`}>Technical</button>
                <button type="button" onClick={() => setAudience("leadership")} aria-pressed={audience === "leadership"} className={`min-h-11 px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C] ${audience === "leadership" ? "bg-[#003366] text-white" : "text-slate-600 hover:bg-slate-50"}`}>Leadership</button>
              </div>
            </div>
            <ol className="mt-2 space-y-3">
              {activeLesson.steps.map((step, index) => <li key={step.title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 py-2">
                <span className="flex h-7 w-7 items-center justify-center border border-slate-300 text-xs font-semibold tabular-nums text-[#003366]">{index + 1}</span>
                <div><h4 className="text-sm font-semibold text-slate-800">{step.title}</h4><p className="mt-1 text-sm leading-6 text-slate-600">{step.body}</p></div>
              </li>)}
            </ol>
            <div className="mt-3 border border-slate-200 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{audience === "technical" ? "Technical checkpoint" : "Leadership checkpoint"}</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{audience === "technical" ? activeLesson.technical : activeLesson.executive}</p>
            </div>

            <section className="mt-5 border-t border-slate-200 pt-5">
              <div className="flex items-center gap-2"><GraduationCap aria-hidden="true" className="h-4 w-4 text-[#8A6B17]" /><h3 className="text-sm font-semibold text-[#003366]">Apply it to a practice account</h3></div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{activeLesson.exercise}</p>
              <label htmlFor="course-reflection" className="mt-3 block text-xs font-semibold text-slate-700">Your working notes</label>
              <textarea id="course-reflection" value={activeState.reflection} onChange={(event) => updateActiveState({ reflection: event.target.value })} rows={3} placeholder="Write a decision, question, or check you would take to the account owner." className="mt-1 w-full resize-y border border-slate-300 bg-white px-3 py-2 text-sm leading-5 text-slate-800 placeholder:text-slate-400 focus:border-[#8A6B17] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50" />
              <p className="mt-1 text-[11px] text-slate-500">Notes save automatically in this browser. Use fictional data only.</p>
            </section>

            <section className="mt-5 border-t border-slate-200 pt-5" aria-labelledby="checkpoint-title">
              <div className="flex items-center gap-2"><CircleHelp aria-hidden="true" className="h-4 w-4 text-[#8A6B17]" /><h3 id="checkpoint-title" className="text-sm font-semibold text-[#003366]">Knowledge check</h3></div>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-800">{activeLesson.question}</p>
              <fieldset className="mt-3 space-y-2">
                <legend className="sr-only">Choose the best answer</legend>
                {activeLesson.choices.map((choice, index) => <label key={choice} className={`flex min-h-11 cursor-pointer items-start gap-3 border px-3 py-2.5 text-sm leading-5 focus-within:ring-2 focus-within:ring-[#C9A84C] ${activeState.selectedAnswer === index ? "border-[#003366] bg-[#F3F6F8]" : "border-slate-200 hover:border-slate-400"}`}>
                  <input type="radio" name={`checkpoint-${activeLesson.id}`} checked={activeState.selectedAnswer === index} onChange={() => updateActiveState({ selectedAnswer: index, passed: false, checked: false })} className="mt-0.5 h-4 w-4 accent-[#003366]" />
                  <span>{choice}</span>
                </label>)}
              </fieldset>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" disabled={activeState.selectedAnswer === null} onClick={checkAnswer} className="min-h-11 border border-[#003366] bg-[#003366] px-4 text-sm font-semibold text-white hover:bg-[#174778] disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C] focus-visible:ring-offset-2">Check answer</button>
                {activeState.passed && <span role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-800"><CheckCircle2 aria-hidden="true" className="h-4 w-4" />Correct. {activeLesson.explanation}</span>}
                {activeState.checked && !activeState.passed && <span className="text-sm text-amber-800">Review the walkthrough, then try again.</span>}
              </div>
              {activeState.passed && !activeState.completed && <button type="button" onClick={() => updateActiveState({ completed: true })} className="mt-3 min-h-11 border border-[#8A6B17] bg-[#FBF8EF] px-4 text-sm font-semibold text-[#5E4B18] hover:bg-[#F4ECCD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]">Mark lesson complete</button>}
            </section>
            <LinkList lesson={activeLesson} />
            <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500">Source: the independent Google Ads Workshop Handbook, dated 14 October 2026. It is not published or endorsed by Google. Walkthroughs and screenshots describe an example account. Google Ads controls and labels can change, so check your live account and linked Google documentation before applying a setting.</p>
          </article>
        </div>
      </section>

      <EchoTutor
        audience={audience}
        messages={messages}
        question={question}
        setQuestion={setQuestion}
        isThinking={isThinking}
        error={echoError}
        endRef={chatEndRef}
        onSubmit={submitQuestion}
      />
    </div>
  </div>;
}

function EchoTutor({ audience, messages, question, setQuestion, isThinking, error, endRef, onSubmit }: {
  audience: Audience;
  messages: EchoMessage[];
  question: string;
  setQuestion: (question: string) => void;
  isThinking: boolean;
  error: string;
  endRef: RefObject<HTMLDivElement | null>;
  onSubmit: (event?: FormEvent, suggested?: string) => void;
}) {
  const quickQuestions = ["How do I define a useful lead conversion?", "What is the difference between a keyword and a search term?", "How should I explain campaign performance to leadership?"];
  return <aside aria-label="Ask Echo about Google Ads" className="flex min-h-[560px] min-w-0 flex-col border border-slate-200 bg-white xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)]">
    <header className="border-b border-slate-200 px-4 py-3">
      <div className="flex items-center gap-2"><MessageCircle aria-hidden="true" className="h-4 w-4 text-[#C9A84C]" /><h2 className="text-sm font-semibold text-[#003366]">Ask Echo</h2></div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{audience === "technical" ? "Technical checks, dependencies, and validation steps." : "Business outcomes, risks, owners, and decisions."} You can ask for either perspective.</p>
    </header>
    <div className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite" aria-relevant="additions text">
      {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`max-w-[95%] border px-3 py-2.5 ${message.role === "user" ? "ml-auto border-[#31577D] bg-[#003366] text-white" : "mr-auto border-slate-200 bg-[#F8FAFB] text-slate-800"}`}>
        <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
        {message.role === "assistant" && message.response?.sources?.length ? <ul className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
          {message.response.sources.map((source) => {
            const marker = message.response?.citations?.find((citation) => citation.sourceId === source.sourceId)?.marker;
            const sourceKind = source.sourceId.startsWith("google-ads-handbook:") ? "handbook" : "official link";
            return <li key={source.sourceId} className="text-xs leading-5">
              {marker && <span className="mr-1 text-slate-500">{marker}</span>}
              {source.url ? <a href={source.url} target="_blank" rel="noreferrer" className="font-medium text-[#003366] underline decoration-[#C9A84C] underline-offset-2">{source.meetingTitle}<ExternalLink aria-hidden="true" className="ml-1 inline h-3 w-3" /></a> : <span className="font-medium text-[#003366]">{source.meetingTitle}</span>}
              <span className="ml-1 text-slate-500">({sourceKind})</span>
            </li>;
          })}
        </ul> : null}
        {message.role === "assistant" && message.response?.followUps?.length ? <div className="mt-2 flex flex-wrap gap-1.5">
          {message.response.followUps.map((followUp) => <button key={followUp} type="button" disabled={isThinking} onClick={() => onSubmit(undefined, followUp)} className="min-h-11 border border-slate-200 px-2 py-1 text-left text-[11px] leading-4 text-[#003366] hover:border-[#C9A84C] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]">{followUp}</button>)}
        </div> : null}
      </div>)}
      {isThinking && <div role="status" className="mr-auto border border-slate-200 bg-[#F8FAFB] px-3 py-2 text-sm text-slate-600">Echo is checking the course notes...</div>}
      {error && <div role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm leading-5 text-red-800">{error}</div>}
      <div ref={endRef} />
    </div>
    <div className="border-t border-slate-200 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">Try asking</p>
      <div className="mb-3 flex flex-wrap gap-1.5">{quickQuestions.map((item) => <button key={item} type="button" disabled={isThinking} onClick={() => onSubmit(undefined, item)} className="min-h-11 border border-slate-200 px-2 py-1 text-left text-[11px] leading-4 text-[#003366] hover:border-[#C9A84C] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]">{item}</button>)}</div>
      <form onSubmit={(event) => onSubmit(event)} className="flex items-end gap-2">
        <label htmlFor="echo-google-ads-question" className="sr-only">Ask Echo a Google Ads question</label>
        <textarea id="echo-google-ads-question" value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} maxLength={1000} placeholder="Ask about a lesson or decision..." className="min-h-11 min-w-0 flex-1 resize-y border border-slate-300 px-3 py-2 text-sm leading-5 focus:border-[#8A6B17] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50" />
        <button type="submit" disabled={!question.trim() || isThinking} aria-label="Send question to Echo" className="flex h-11 w-11 shrink-0 items-center justify-center border border-[#003366] bg-[#003366] text-white hover:bg-[#174778] disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C] focus-visible:ring-offset-2"><Send aria-hidden="true" className="h-4 w-4" /></button>
      </form>
      <p className="mt-2 text-[10px] leading-4 text-slate-500">Echo uses the handbook. Official links open current Google documentation. Verify account-specific settings before acting.</p>
    </div>
  </aside>;
}

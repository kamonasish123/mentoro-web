// pages/about.js
import Head from 'next/head'
import { useEffect, useState } from 'react'

/* -------------------------
   Profile data (edit as needed)
   ------------------------- */
const PROFILE = {
  name: 'Kamonasish Roy',
  title: 'Software Engineer | Competitive Programmer',
  location: 'Sylhet, Bangladesh',
  email: 'rkamonasish@gmail.com',
  phone: '+8801795985912',
  summary:
    'Software Engineer with over one year of professional software development experience and six years of competitive programming expertise. I build high-performance, scalable applications and help students win contests.',
  stats: { experienceYears: 1, competitiveYears: 6, solved: 5000, cfRating: 1475 },
  work: [
    { role: 'Problem Setter and Contest Coordinator', org: 'SeriousOJ', period: '04/2024 - Present', note: 'Contributed 100+ problems' },
    { role: 'Junior Software Engineer', org: 'I-Tech', period: '03/2023 - 02/2024', note: 'Built Flutter apps; optimized performance' },
    { role: 'Intern', org: 'AlgoMatrix', period: '06/2022 - 11/2022', note: 'Flutter project for semi-government client' },
  ],
  projects: [
    { title: 'Mentoro Android Application', period: '02/2021 - 09/2021', desc: 'React Native + Firebase; integrated Codeforces & CodeChef APIs' },
    { title: 'Child Security Android Application', period: '2022 - 07/2022', desc: 'Kotlin + Firebase; YouTube API integration' },
  ],
  competitive: [
    { title: 'CodeChef July Challenge 2020', note: 'Global Rank 37' },
    { title: 'ICPC Dhaka Regional', note: 'Ranked 51st' },
    { title: 'LU Intra Programming Contest', note: 'Champion 2021' },
    { title: 'Codeforces', note: 'Specialist (max rating 1475)' },
    { title: 'Solved problems', note: '5000+ across judges' },
  ],

  /* Education updated exactly as requested (no GPA, no separate address fields) */
  education: [
    {
      school: 'Leading University, Bangladesh',
      degree: 'B.Sc. in Computer Science and Engineering',
      period: '01/2018 - 04/2022',
    },
    {
      school: 'Scholarshome College, Sylhet',
      degree: 'HSC in Science',
      period: '2016',
    },
    {
      school: 'Shimantik Ideal School and College, Sylhet',
      degree: 'SSC in Science',
      period: '2014',
    },
  ],

  research: [
    'Algorithmic problem solving and contest problem design',
    'Performance optimization for mobile apps',
    'Educational tooling for competitive programmers',
  ],
  achievements: [
    'IEEEXtreme top placements (6th place)',
    'CodeChef global rank 37 (July 2020)',
    'Facebook Hacker Cup 2021 — Qualified for 2nd Round',
  ],
  hobbies: ['Competitive programming coaching', 'Open-source contributions', 'Reading research papers', 'Cycling'],

  /* Skills grouped and ordered exactly as requested */
  skillsGrouped: {
    programmingLanguages: [
      'C / C++',
      'Java',
      'Python',
      'JavaScript',
      'Rust',
      'Kotlin',
      'Dart',
    ],
    frontendAndWeb: [
      'HTML5',
      'CSS3',
      'Tailwind CSS',
      'React',
      'Next.js',
    ],
    mobileAndCrossPlatform: [
      'Flutter',
      'React Native',
    ],
    backendAndAPIs: [
      'FastAPI',
      'Firebase',
    ],
    databases: [
      'PostgreSQL',
    ],
    versionControl: [
      'Git',
      'GitHub',
    ],
  },

  certifications: ['Facebook Hacker Cup 2021 — Qualified for 2nd Round'],
}

/* CV path (set to your hosted PDF) */
const cvUrl = '' // e.g. '/Kamonasish_Roy_CV.pdf'

/* -------------------------
   Helper: Section list (serialized)
   ------------------------- */
const SECTIONS = [
  { id: 'skills', title: 'Skills & Tools' },
  { id: 'work', title: 'Work Experience' },
  { id: 'projects', title: 'Projects' },
  { id: 'competitive', title: 'Competitive Programming' },
  { id: 'education', title: 'Education' },
  { id: 'research', title: 'Research Interests' },
  { id: 'achievements', title: 'Achievements & Honors' },
  { id: 'hobbies', title: 'Hobbies & Interests' },
]

/* -------------------------
   Page component
   ------------------------- */
export default function AboutPage() {
  const [active, setActive] = useState(SECTIONS[0].id)
  const [isMobile, setIsMobile] = useState(false)
  const [expanded, setExpanded] = useState({}) // track collapsible state per section
  const [cvNotice, setCvNotice] = useState('')

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 760)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    // default: expand all on desktop, collapse on mobile
    const initial = {}
    SECTIONS.forEach((s) => { initial[s.id] = !isMobile })
    setExpanded(initial)
  }, [isMobile])

  useEffect(() => {
    // IntersectionObserver to highlight active section in TOC
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id)
        })
      },
      { root: null, rootMargin: '0px 0px -40% 0px', threshold: 0.2 }
    )
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [])

  function scrollTo(id) {
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // focus for accessibility
    setTimeout(() => el.querySelector('h2')?.focus?.(), 400)
  }

  function toggleSection(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function handleDownloadCV() {
    if (!cvUrl) {
      setCvNotice('CV URL not configured. Add your CV URL to the code (cvUrl variable).')
      setTimeout(() => setCvNotice(''), 3500)
      return
    }
    window.open(cvUrl, '_blank', 'noopener')
  }

  return (
    <>
      <Head>
        <title>About — {PROFILE.name}</title>
        <meta name="description" content={`${PROFILE.name} — ${PROFILE.title}. ${PROFILE.summary}`} />
      </Head>

      {/* Force pure black root (defensive) */}
      <style jsx global>{`
        html, body, #__next { background: #000 !important; color: #e6f7ff !important; }
        .about-root { background: transparent !important; }
      `}</style>

      <main className="about-root">
        <div className="container">
          {/* Left column: profile + mini TOC */}
          <aside className="left-col" aria-label="Profile and navigation">
            <div className="profile-card">
              <div className="avatar-wrap">
                <img src="/avatar.jpg" alt={`${PROFILE.name} portrait`} onError={(e) => (e.currentTarget.src = '/avatar-fallback.png')} />
              </div>
              <h1 className="name">{PROFILE.name}</h1>
              <div className="title">{PROFILE.title}</div>
              <p className="bio">{PROFILE.summary}</p>

              <div className="contact">
                <a href={`mailto:${PROFILE.email}`} className="contact-link">{PROFILE.email}</a>
                <a href={`tel:${PROFILE.phone}`} className="contact-link">{PROFILE.phone}</a>
                <div className="location muted">{PROFILE.location}</div>
              </div>

              <div className="cta-row">
                <button className="btn btn-cyan" onClick={() => (window.location.href = `mailto:${PROFILE.email}`)}>Contact</button>
                <button className="btn btn-outline" onClick={handleDownloadCV}>Download CV</button>
              </div>
              <div className="cv-notice" role="status" aria-live="polite">{cvNotice}</div>
            </div>

            <nav className="mini-toc" aria-label="Sections">
              {SECTIONS.map((s, i) => (
                <button
                  key={s.id}
                  className={`toc-item ${active === s.id ? 'active' : ''}`}
                  onClick={() => scrollTo(s.id)}
                  aria-current={active === s.id ? 'true' : 'false'}
                >
                  <span className="toc-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="toc-title">{s.title}</span>
                </button>
              ))}
            </nav>
          </aside>

          {/* Right column: serialized sections */}
          <section className="right-col">
            {SECTIONS.map((s, idx) => (
              <article key={s.id} id={s.id} className="section-card" tabIndex={-1} aria-labelledby={`${s.id}-h`}>
                <header className="section-header">
                  <div className="sec-index">{String(idx + 1).padStart(2, '0')}</div>
                  <h2 id={`${s.id}-h`} className="sec-title" tabIndex={-1}>{s.title}</h2>
                  <button className="collapse-btn" onClick={() => toggleSection(s.id)} aria-expanded={!!expanded[s.id]}>
                    {expanded[s.id] ? 'Collapse' : 'Expand'}
                  </button>
                </header>

                <div className={`sec-body ${expanded[s.id] ? 'open' : 'closed'}`}>
                  {/* Render content per section id */}
                  {s.id === 'skills' && (
                    <div className="skills-card">
                      <div className="skills-sub">
                        <h3 className="subhead">Programming Languages</h3>
                        <div className="skills-grid">
                          {PROFILE.skillsGrouped.programmingLanguages.map((sk) => (
                            <span key={sk} className="skill-pill">{sk}</span>
                          ))}
                        </div>
                      </div>

                      <div className="skills-sub">
                        <h3 className="subhead">Frontend & Web</h3>
                        <div className="skills-grid">
                          {PROFILE.skillsGrouped.frontendAndWeb.map((sk) => (
                            <span key={sk} className="skill-pill">{sk}</span>
                          ))}
                        </div>
                      </div>

                      <div className="skills-sub">
                        <h3 className="subhead">Mobile & Cross-Platform</h3>
                        <div className="skills-grid">
                          {PROFILE.skillsGrouped.mobileAndCrossPlatform.map((sk) => (
                            <span key={sk} className="skill-pill">{sk}</span>
                          ))}
                        </div>
                      </div>

                      <div className="skills-sub">
                        <h3 className="subhead">Backend & APIs</h3>
                        <div className="skills-grid">
                          {PROFILE.skillsGrouped.backendAndAPIs.map((sk) => (
                            <span key={sk} className="skill-pill">{sk}</span>
                          ))}
                        </div>
                      </div>

                      <div className="skills-sub">
                        <h3 className="subhead">Databases</h3>
                        <div className="skills-grid">
                          {PROFILE.skillsGrouped.databases.map((sk) => (
                            <span key={sk} className="skill-pill">{sk}</span>
                          ))}
                        </div>
                      </div>

                      <div className="skills-sub">
                        <h3 className="subhead">Version Control & Collaboration</h3>
                        <div className="skills-grid">
                          {PROFILE.skillsGrouped.versionControl.map((sk) => (
                            <span key={sk} className="skill-pill">{sk}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {s.id === 'work' && (
                    <div className="work-list">
                      {PROFILE.work.map((w) => (
                        <div key={w.role} className="work-item">
                          <div className="work-left">
                            <div className="work-role">{w.role}</div>
                            <div className="work-org muted">{w.org}</div>
                          </div>
                          <div className="work-right">
                            <div className="work-period muted">{w.period}</div>
                            <div className="work-note">{w.note}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {s.id === 'projects' && (
                    <div className="projects-list">
                      {PROFILE.projects.map((p) => (
                        <div key={p.title} className="proj-card">
                          <div className="proj-title">{p.title}</div>
                          <div className="proj-period muted">{p.period}</div>
                          <div className="proj-desc">{p.desc}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {s.id === 'competitive' && (
                    <div className="comp-list">
                      {/* New compact table view with handle links and a "View (100+)" button (no link for now) */}
                      <div className="comp-table">
                        <div className="comp-row comp-header">
                          <div className="col-judge">Online Judge</div>
                          <div className="col-handle">Handle</div>
                          <div className="col-rating">Rating</div>
                          <div className="col-solved">Solved</div>
                        </div>

                        <div className="comp-row">
                          <div className="col-judge">Codeforces</div>
                          <div className="col-handle">
                            <a className="handle-btn btn btn-outline" href="https://codeforces.com/profile/Bullet" target="_blank" rel="noopener noreferrer">Bullet</a>
                          </div>
                          <div className="col-rating">1475</div>
                          <div className="col-solved">2000+</div>
                        </div>

                        <div className="comp-row">
                          <div className="col-judge">CodeChef</div>
                          <div className="col-handle">
                            <a className="handle-btn btn btn-outline" href="https://www.codechef.com/users/kamonasish123" target="_blank" rel="noopener noreferrer">kamonasish123</a>
                          </div>
                          <div className="col-rating">1901</div>
                          <div className="col-solved">500+</div>
                        </div>

                        <div className="comp-row">
                          <div className="col-judge">LeetCode</div>
                          <div className="col-handle">
                            <a className="handle-btn btn btn-outline" href="https://leetcode.com/u/I_LOVE_SWEETY" target="_blank" rel="noopener noreferrer">kamonasish</a>
                          </div>
                          <div className="col-rating">1800</div>
                          <div className="col-solved">500+</div>
                        </div>

                        <div className="comp-footer">
                          <div className="authored-text">My authored problems on different judges.</div>
                          <div className="authored-cta">
                            <button className="btn btn-outline" disabled>View (100+)</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {s.id === 'education' && (
                    <div className="education-list">
                      {PROFILE.education.map((edu) => (
                        <div key={edu.school} className="edu-card">
                          <div className="edu-left">
                            <div className="edu-school">{edu.school}</div>
                            <div className="edu-degree">{edu.degree}</div>
                            <div className="edu-period muted">{edu.period}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {s.id === 'research' && (
                    <ul className="research-list">
                      {PROFILE.research.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  )}

                  {s.id === 'achievements' && (
                    <ul className="ach-list">
                      {PROFILE.achievements.map((a) => <li key={a}>{a}</li>)}
                    </ul>
                  )}

                  {s.id === 'hobbies' && (
                    <div className="hobbies">
                      {PROFILE.hobbies.map((h) => <span key={h} className="hobby-pill">{h}</span>)}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </section>
        </div>

        {/* Floating contact CTA */}
        <button className="floating-contact" onClick={() => (window.location.href = `mailto:${PROFILE.email}`)} aria-label="Quick contact">✉</button>
      </main>

      {/* Styles */}
      <style jsx>{`
        :root {
          --bg: #000;
          --panel: rgba(255,255,255,0.01);
          --glass-border: rgba(255,255,255,0.03);
          --accent: #00d2ff;
          --muted: rgba(255,255,255,0.72);
          --card-radius: 12px;
          font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
        }
        html,body,#__next { height: 100%; background: var(--bg); color: #e6f7ff; }
        .about-root { min-height: 100vh; padding: 28px; background: transparent; position: relative; }

        .container { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 320px 1fr; gap: 22px; align-items: start; }

        /* Left column */
        .left-col { position: sticky; top: 24px; align-self: start; display:flex; flex-direction:column; gap:16px; }
        .profile-card { background: var(--panel); border-radius: var(--card-radius); padding: 16px; border: 1px solid var(--glass-border); text-align:center; transition: box-shadow .18s ease, transform .12s ease; }
        .profile-card:hover { border-color: rgba(0,210,255,0.18); box-shadow: 0 30px 80px rgba(0,210,255,0.06); transform: translateY(-6px); }
        .avatar-wrap { width: 160px; height: 160px; margin: 0 auto 8px; border-radius: 12px; overflow:hidden; }
        .avatar-wrap img { width:100%; height:100%; object-fit:cover; display:block; }
        .name { margin: 6px 0 0; font-size:18px; color:#e6f7ff; }
        .title { color: var(--muted); font-size:13px; margin-bottom:8px; }
        .bio { color: var(--muted); font-size:13px; line-height:1.4; margin: 8px 0; }

        .contact { display:flex; flex-direction:column; gap:6px; align-items:center; margin-top:6px; }
        .contact-link { color: var(--accent); text-decoration:none; font-weight:600; font-size:13px; }
        .location { color: var(--muted); font-size:12px; }

        .cta-row { display:flex; gap:8px; justify-content:center; margin-top:10px; }
        .btn { padding:8px 10px; border-radius:10px; border:1px solid rgba(255,255,255,0.04); background: rgba(255,255,255,0.02); color: var(--muted); cursor:pointer; }
        .btn-cyan { background: linear-gradient(90deg, rgba(0,210,255,0.06), rgba(0,210,255,0.03)); color: var(--accent); border: 1px solid rgba(0,210,255,0.12); font-weight:700; }
        .btn-outline { background: transparent; color: var(--muted); }

        .cv-notice { color: var(--accent); font-size:13px; min-height:18px; margin-top:6px; }

        /* mini TOC */
        .mini-toc { margin-top: 6px; display:flex; flex-direction:column; gap:8px; }
        .toc-item { display:flex; gap:10px; align-items:center; padding:8px; border-radius:10px; background: transparent; border: 1px solid transparent; color: var(--muted); cursor:pointer; text-align:left; }
        .toc-item:hover { background: rgba(255,255,255,0.01); border-color: rgba(0,210,255,0.06); color: #e6f7ff; transform: translateY(-3px); }
        .toc-item.active { background: linear-gradient(90deg, rgba(0,210,255,0.06), rgba(0,210,255,0.03)); color: #00121a; border-color: rgba(0,210,255,0.12); font-weight:700; }
        .toc-num { font-weight:800; min-width:36px; color: var(--accent); }
        .toc-title { font-size:13px; }

        /* Right column: serialized sections */
        .right-col { display:flex; flex-direction:column; gap:18px; }
        .section-card { background: var(--panel); border-radius: 12px; padding: 14px; border: 1px solid var(--glass-border); transition: transform .14s ease, box-shadow .18s ease, border-color .18s ease; }
        .section-card:focus { outline: none; box-shadow: 0 30px 80px rgba(0,210,255,0.06); border-color: rgba(0,210,255,0.12); transform: translateY(-6px); }
        .section-card:hover { border-color: rgba(0,210,255,0.12); box-shadow: 0 30px 80px rgba(0,210,255,0.06); transform: translateY(-6px); }

        .section-header { display:flex; align-items:center; gap:12px; margin-bottom:10px; }
        .sec-index { font-weight:800; color: var(--accent); min-width:48px; font-size:14px; }
        .sec-title { margin:0; font-size:18px; color:#e6f7ff; }
        .collapse-btn { margin-left:auto; background: transparent; border: none; color: var(--accent); cursor:pointer; font-weight:700; }

        .sec-body.closed { display:none; }
        .sec-body.open { display:block; }

        /* Skills card specific */
        .skills-card { display:flex; flex-direction:column; gap:14px; }
        .skills-sub { border-radius:10px; padding:10px; background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.02); }
        .subhead { margin:0 0 8px 0; color:#e6f7ff; font-size:14px; }
        .skills-grid { display:flex; flex-wrap:wrap; gap:8px; }
        .skill-pill { background: rgba(255,255,255,0.02); padding:6px 10px; border-radius:999px; color: var(--muted); font-weight:600; }

        .work-list { display:flex; flex-direction:column; gap:12px; }
        .work-item { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
        .work-role { font-weight:700; color:#e6f7ff; }
        .work-org, .work-period { color: var(--muted); font-size:13px; }
        .work-note { color: var(--muted); font-size:13px; margin-top:6px; }

        .projects-list { display:flex; flex-direction:column; gap:12px; }
        .proj-card { padding:10px; border-radius:10px; background: rgba(255,255,255,0.01); }
        .proj-title { font-weight:700; color:#e6f7ff; }
        .proj-period, .proj-desc { color: var(--muted); font-size:13px; }

        .comp-list { display:flex; flex-direction:column; gap:8px; }
        .comp-item { padding:8px; border-radius:8px; background: rgba(255,255,255,0.01); }
        .comp-title { font-weight:700; color:#e6f7ff; }
        .comp-note { color: var(--muted); font-size:13px; }

        /* Competitive table styles */
        .comp-table { display:flex; flex-direction:column; gap:8px; }
        .comp-row { display:grid; grid-template-columns: 1fr 1fr 96px 96px; gap:12px; align-items:center; padding:8px; border-radius:8px; }
        .comp-header { font-weight:800; color: var(--accent); opacity:0.95; }
        .col-judge { font-weight:700; }
        .col-handle { }
        .col-rating, .col-solved { color: var(--muted); font-size:13px; }
        .handle-btn { text-decoration:none; display:inline-block; }
        .comp-footer { display:flex; justify-content:space-between; align-items:center; padding-top:6px; border-top:1px dashed rgba(255,255,255,0.02); margin-top:6px; }
        .authored-text { color: var(--muted); font-size:13px; }
        .authored-cta { }

        .education-list { display:flex; flex-direction:column; gap:12px; }
        .edu-card { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px; border-radius:10px; background: rgba(255,255,255,0.01); }
        .edu-school { font-weight:700; color:#e6f7ff; }
        .edu-degree { color: var(--muted); }
        .edu-period { color: var(--muted); font-size:13px; }

        .research-list, .ach-list { padding-left:18px; color: var(--muted); }
        .hobbies { display:flex; gap:8px; flex-wrap:wrap; }
        .hobby-pill { background: rgba(255,255,255,0.02); padding:6px 10px; border-radius:999px; color: var(--muted); }

        .floating-contact { position: fixed; right: 18px; bottom: 18px; width: 56px; height: 56px; border-radius: 999px; background: linear-gradient(180deg, var(--accent), #00a8d6); color: #06202a; border: none; font-size:20px; display:flex; align-items:center; justify-content:center; box-shadow: 0 12px 40px rgba(0,210,255,0.12); cursor:pointer; z-index: 80; }

        /* Hover glow (strong) */
        .section-card:hover, .profile-card:hover, .proj-card:hover { transform: translateY(-8px); border-color: rgba(0,210,255,0.18); box-shadow: 0 40px 120px rgba(0,210,255,0.12); }

        @media (max-width: 980px) {
          .container { grid-template-columns: 1fr; padding: 0 12px; }
          .left-col { position: relative; order: 1; }
          .right-col { order: 2; }
          .mini-toc { display:flex; gap:6px; overflow:auto; padding:6px 0; }
          .toc-item { min-width: 140px; flex: 0 0 auto; }
          .comp-row { grid-template-columns: 1fr 1fr 84px 84px; }
        }
      `}</style>
    </>
  )
}

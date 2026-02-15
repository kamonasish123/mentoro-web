// pages/about.js
import Head from 'next/head'
import { useEffect, useState } from 'react'

const toToolList = (tools) => {
  if (!tools) return []
  if (Array.isArray(tools)) return tools
  return String(tools).split(',').map((t) => t.trim()).filter(Boolean)
}

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
    'I am a Software Engineer with professional industry experience and over seven years of competitive programming expertise. I focus on building efficient, scalable software and helping students sharpen their problem-solving skills for competitive programming.',
  summaryExtra:
    'In addition, I contribute as a Contest Coordinator and Problem Setter at SeriousOJ.',
  stats: { experienceYears: 1, competitiveYears: 6, solved: 5000, cfRating: 1475 },
  work: [
    {
      section: '',
      items: [
        {
          role: 'Software Engineer',
          org: 'I-Tech',
          bullets: [
            'Developed and maintained Flutter applications for production use',
            'Improved application performance, responsiveness, and stability',
            'Collaborated with designers and backend developers to deliver scalable solutions',
          ],
        },
        {
          role: 'Software Engineering Intern',
          org: 'AlgoMatrix',
          bullets: [
            'Built a Flutter-based application for a semi-government client',
            'Implemented core features and UI components under production constraints',
            'Gained hands-on experience with real-world development workflows',
          ],
        },
      ],
    },
    {
      section: 'Competitive Programming & Community Work',
      items: [
        {
          role: 'Problem Setter & Contest Coordinator',
          org: 'SeriousOJ',
          bullets: [
            'Authored and reviewed 100+ competitive programming problems',
            'Coordinated online contests, ensuring fairness, quality, and smooth execution',
            'Contributed to problem testing, editorial preparation, and platform growth',
          ],
        },
      ],
    },
  ],
  projects: [
    {
      title: 'Jononi Pharmacy App',
      desc:
        'This Pharmacy Management System is a complete digital solution designed to manage daily pharmacy operations efficiently. It helps handle medicine inventory, sales, customer dues, digital payments, and staff activity with proper role-based access control. The system ensures accurate stock tracking, secure data handling, and transparent accounting.',
      tools: ['Flutter', 'Dart', 'Firebase'],
      github: 'https://github.com/kamonasish123/jononi-pharmacy',
    },
    {
      title: 'Kamonasish.com',
      desc:
        'This project is a full-stack mentoring and learning platform designed for competitive programming and technical education. It includes secure authentication using Supabase, a role-based admin dashboard, and a blogging system where users can read posts and participate through comments.',
      tools: ['Next.js', 'Tailwind CSS', 'PostgreSQL'],
      github: 'https://github.com/kamonasish123/mentoro-web',
    },
    {
      title: 'Child Security Android Application',
      desc:
        'A child safety and educational monitoring app inspired by Google Parental Controls. The application helps parents supervise their child’s digital activities, manage screen usage, and provide safe educational content. It integrates YouTube to allow controlled access to learning videos while ensuring a secure and child-friendly environment.',
      tools: ['Kotlin', 'Firebase', 'YouTube Data API'],
    },
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
    'Artificial Intelligence',
    'Machine Learning',
    'Data Structures and Algorithms (DSA)',
    'Game Theory',
    'Graph Theory',
  ],
  achievements: [
    {
      title: 'Facebook Hacker Cup 2021',
      rankText: 'Global Rank: 1367',
      link: 'https://web.facebook.com/codingcompetitions/hacker-cup/2021/certificate/584098462619551',
    },
    {
      title: 'IEEEXtreme 14.0 Programming Contest',
      rankText: 'Global Rank: 193',
      link: 'https://drive.google.com/file/d/1OS_3OHh-Z1WaonIbSMsIYggikIZN2S3p/view',
    },
    {
      title: 'IEEEXtreme 15.0 Programming Contest',
      rankText: 'Global Rank: 179',
      link: 'https://drive.google.com/file/d/1FfYpTKKWhISviXumTOBitIslhnCg3-Nq/view',
    },
    {
      title: 'International Collegiate Programming Contest (ICPC) 2020, Dhaka Region',
      rankText: 'Rank: 41st',
      link: 'https://algo.codemarshal.org/contests/icpc-dhaka-20/standings',
    },
    {
      title: 'LU TechStorm 4 Programming Contest 2021',
      rankText: 'Champion',
      link: 'https://toph.co/contests/training/ebarn2t/standings',
    },
    {
      title: 'Judge and Problem Setter',
      rankText: 'LU IUJPC : Sylhet Division 2024',
      link: 'https://serious-oj.com/contest/67559b35a9f1c7000843e73f',
    },
    {
      title: 'Judge',
      rankText: 'LUCC Presents Kick & Code Intra LU Programming Contest 2025',
      link: 'https://serious-oj.com/contest/68b47967dc7245000855279c',
    },
  ],
  hobbies: [
    'Writing humorous and insightful blog posts',
    'Traveling and exploring new places',
    'Reading books',
    'Fishing',
    'Problem solving and logical puzzles',
    'Watching movies and analytical storytelling',
  ],

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

  certifications: ['Facebook Hacker Cup 2021 â€” Qualified for 2nd Round'],
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
    // Scroll spy: set active to the last section whose top is above a threshold
    const offset = 140
    const onScroll = () => {
      const topThreshold = 50
      if (window.scrollY <= topThreshold) {
        if (SECTIONS[0]?.id) setActive(SECTIONS[0].id)
        return
      }
      let current = SECTIONS[0]?.id
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id)
        if (!el) continue
        const top = el.getBoundingClientRect().top
        if (top - offset <= 0) current = s.id
      }
      if (current) setActive(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
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
        <title>{`About - ${PROFILE.name}`}</title>
        <meta name="description" content={`${PROFILE.name} â€” ${PROFILE.title}. ${PROFILE.summary}`} />
      </Head>

      {/* Match homepage background */}
      <style jsx global>{`
        html, body, #__next { height: 100%; }
        body {
          background: #0f172a;
          color: #e6f7ff;
          background-image:
            linear-gradient(rgba(0,210,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,210,255,0.03) 1px, transparent 1px);
          background-size: 50px 50px;
        }
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
              <p className="bio" style={{ marginTop: 10 }}>
                In addition, I contribute as a Contest Coordinator and Problem Setter at{' '}
                <a
                  href="https://serious-oj.com/user/28"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'underline', textDecorationThickness: 2, textUnderlineOffset: 3, fontWeight: 700 }}
                >
                  SeriousOJ
                </a>.
              </p>

              <div className="cta-row">
                <a className="btn btn-cyan" href="/#contact">Contact</a>
                <button className="btn btn-outline" onClick={handleDownloadCV} disabled title="CV coming soon">Download CV</button>
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
                    <div>
                      {PROFILE.work.map((section, idx) => (
                        <div key={`${section.section || 'work'}-${idx}`} className="work-section">
                          {section.section ? (
                            <div className="work-section-title">{section.section}</div>
                          ) : null}
                          <div className="work-list">
                            {(section.items || []).map((w) => (
                              <div key={`${section.section}-${w.role}`} className="work-item">
                                <div className="work-header">
                                  <div>
                                    <div className="work-role">{w.role}</div>
                                    <div className="work-org muted">{w.org}</div>
                                  </div>
                                  {w.period ? <div className="work-period muted">{w.period}</div> : null}
                                </div>
                                {Array.isArray(w.bullets) && w.bullets.length > 0 ? (
                                  <ul className="work-bullets">
                                    {w.bullets.map((b) => <li key={b}>{b}</li>)}
                                  </ul>
                                ) : w.note ? (
                                  <div className="work-note">{w.note}</div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {s.id === 'projects' && (
                    <div className="projects-list">
                      {PROFILE.projects.map((p) => {
                        const githubLink = typeof p.github === 'string' ? p.github.trim() : ''
                        return (
                        <div key={p.title} className="proj-card">
                          <div className="proj-header">
                            <div className="proj-title">{p.title}</div>
                            {githubLink ? (
                              <a
                                className="proj-github"
                                href={githubLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Open ${p.title} on GitHub`}
                                title="GitHub"
                              >
                                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path d="M12 2C8.13 2 5 5.13 5 9.02c0 3.86 2.44 5.66 4.75 6.22.35.06.48-.15.48-.34 0-.17-.01-.62-.01-1.22-1.94.42-2.35-.94-2.35-.94-.32-.82-.78-1.04-.78-1.04-.64-.44.05-.43.05-.43.71.05 1.08.73 1.08.73.63 1.08 1.66.77 2.07.59.06-.46.25-.77.45-.95-1.55-.18-3.18-.78-3.18-3.47 0-.77.27-1.4.72-1.9-.07-.18-.31-.9.07-1.88 0 0 .59-.19 1.93.72.56-.16 1.16-.24 1.76-.24.6 0 1.2.08 1.76.24 1.34-.91 1.93-.72 1.93-.72.38.98.14 1.7.07 1.88.45.5.72 1.13.72 1.9 0 2.7-1.63 3.29-3.18 3.47.26.22.49.66.49 1.33 0 .96-.01 1.73-.01 1.97 0 .19.13.41.49.34C16.56 14.68 19 12.88 19 9.02 19 5.13 15.87 2 12 2z" stroke="currentColor" strokeWidth="0.5" />
                                </svg>
                              </a>
                            ) : (
                              <span
                                className="proj-github is-disabled"
                                aria-disabled="true"
                                title="GitHub link not available"
                              >
                                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path d="M12 2C8.13 2 5 5.13 5 9.02c0 3.86 2.44 5.66 4.75 6.22.35.06.48-.15.48-.34 0-.17-.01-.62-.01-1.22-1.94.42-2.35-.94-2.35-.94-.32-.82-.78-1.04-.78-1.04-.64-.44.05-.43.05-.43.71.05 1.08.73 1.08.73.63 1.08 1.66.77 2.07.59.06-.46.25-.77.45-.95-1.55-.18-3.18-.78-3.18-3.47 0-.77.27-1.4.72-1.9-.07-.18-.31-.9.07-1.88 0 0 .59-.19 1.93.72.56-.16 1.16-.24 1.76-.24.6 0 1.2.08 1.76.24 1.34-.91 1.93-.72 1.93-.72.38.98.14 1.7.07 1.88.45.5.72 1.13.72 1.9 0 2.7-1.63 3.29-3.18 3.47.26.22.49.66.49 1.33 0 .96-.01 1.73-.01 1.97 0 .19.13.41.49.34C16.56 14.68 19 12.88 19 9.02 19 5.13 15.87 2 12 2z" stroke="currentColor" strokeWidth="0.5" />
                                </svg>
                              </span>
                            )}
                          </div>
                          <div className="proj-desc">{p.desc}</div>
                          {p.tools ? (
                            <div className="proj-tools">
                              <div className="proj-tools-label">Tools:</div>
                              <div className="skills-grid proj-tools-grid">
                                {toToolList(p.tools).map((tool) => (
                                  <span key={tool} className="skill-pill">{tool}</span>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )})}
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
                            <a
                              className="btn btn-outline"
                              href="https://serious-oj.com/user/28?tabIndex=1"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View (100+)
                            </a>
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
                      {PROFILE.achievements.map((a) => (
                        <li key={a.title}>
                          {a.title}
                          <div className="ach-sub">
                            • <a href={a.link} target="_blank" rel="noopener noreferrer">{a.rankText}</a>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {s.id === 'hobbies' && (
                    <ul className="hobbies-list">
                      {PROFILE.hobbies.map((h) => <li key={h}>{h}</li>)}
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </section>
        </div>

      </main>

      {/* Styles */}
      <style jsx>{`
        :root {
          --bg: #0f172a;
          --grid-cyan: rgba(0,210,255,0.03);
          --panel: rgba(0,0,0,0.75);
          --panel-soft: rgba(0,0,0,0.6);
          --glass-border: rgba(255,255,255,0.03);
          --accent: #00d2ff;
          --muted: rgba(255,255,255,0.72);
          --card-radius: 12px;
          font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
        }
        html,body,#__next {
          height: 100%;
          background: var(--bg);
          color: #e6f7ff;
          background-image:
            linear-gradient(var(--grid-cyan) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid-cyan) 1px, transparent 1px);
          background-size: 50px 50px;
        }
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
        .toc-title { font-size:13px; }

        /* Right column: serialized sections */
        .right-col { display:flex; flex-direction:column; gap:18px; }
        .section-card { background: var(--panel); border-radius: 12px; padding: 14px; border: 1px solid var(--glass-border); transition: transform .14s ease, box-shadow .18s ease, border-color .18s ease; }
        .section-card:focus { outline: none; box-shadow: 0 30px 80px rgba(0,210,255,0.06); border-color: rgba(0,210,255,0.12); transform: translateY(-6px); }
        .section-card:hover { border-color: rgba(0,210,255,0.12); box-shadow: 0 30px 80px rgba(0,210,255,0.06); transform: translateY(-6px); }

        .section-header { display:flex; align-items:center; gap:12px; margin-bottom:10px; }
        .sec-title { margin:0; font-size:18px; color:#e6f7ff; }
        .collapse-btn { margin-left:auto; background: transparent; border: none; color: var(--accent); cursor:pointer; font-weight:700; }

        .sec-body.closed { display:none; }
        .sec-body.open { display:block; }

        /* Skills card specific */
        .skills-card { display:flex; flex-direction:column; gap:14px; }
        .skills-sub { border-radius:10px; padding:10px; background: var(--panel-soft); border: 1px solid rgba(255,255,255,0.02); }
        .subhead { margin:0 0 8px 0; color:#e6f7ff; font-size:14px; }
        .skills-grid { display:flex; flex-wrap:wrap; gap:8px; }
        .skill-pill { background: rgba(255,255,255,0.02); padding:6px 10px; border-radius:999px; color: var(--muted); font-weight:600; }

        .work-section { margin-bottom: 18px; }
        .work-section-title { font-weight: 700; color: #e6f7ff; margin-bottom: 10px; font-size: 14px; letter-spacing: 0.4px; }
        .work-list { display:flex; flex-direction:column; gap:12px; }
        .work-item { background: var(--panel-soft); border: 1px solid rgba(255,255,255,0.04); padding: 12px; border-radius: 12px; }
        .work-header { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
        .work-role { font-weight:700; color:#e6f7ff; }
        .work-org, .work-period { color: var(--muted); font-size:13px; }
        .work-note { color: var(--muted); font-size:13px; margin-top:6px; }
        .work-bullets { margin: 8px 0 0 18px; color: var(--muted); list-style: disc; line-height: 1.5; }
        .work-bullets li { margin-bottom: 4px; }

        .projects-list { display:flex; flex-direction:column; gap:12px; }
        .proj-card { padding:10px; border-radius:10px; background: var(--panel-soft); border: 1px solid rgba(255,255,255,0.04); }
        .proj-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:6px; }
        .proj-title { font-weight:700; color:#e6f7ff; }
        .proj-desc { color: var(--muted); font-size:13px; line-height:1.5; }
        .proj-tools { margin-top:8px; }
        .proj-tools-label { color: var(--muted); font-size:12px; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom:6px; }
        .proj-tools-grid { }
        .proj-github { width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); color: var(--muted); transition: transform .12s ease, border-color .12s ease, color .12s ease; }
        .proj-github:hover { color: var(--accent); border-color: rgba(0,210,255,0.3); transform: translateY(-2px); }
        .proj-github.is-disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
        .proj-github svg { width:18px; height:18px; display:block; }

        .comp-list { display:flex; flex-direction:column; gap:8px; }
        .comp-item { padding:8px; border-radius:8px; background: var(--panel-soft); }
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
        .edu-card { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px; border-radius:10px; background: var(--panel-soft); }
        .edu-school { font-weight:700; color:#e6f7ff; }
        .edu-degree { color: var(--muted); }
        .edu-period { color: var(--muted); font-size:13px; }

        .research-list, .ach-list { padding-left:18px; color: var(--muted); list-style: disc; }
        .ach-sub { margin-top: 6px; margin-left: 6px; font-size: 13px; color: var(--muted-2); }
        .ach-sub a { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
        .hobbies-list { padding-left:18px; color: var(--muted); list-style: disc; }

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


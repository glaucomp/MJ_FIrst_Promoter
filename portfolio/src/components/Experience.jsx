import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { experience } from '../data/portfolio';

function ExperienceCard({ company, role, period, location, highlights, tech, color, index }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.7, delay: 0.1 }}
      className="relative pl-8 pb-12 last:pb-0"
    >
      {/* Timeline line */}
      <div
        className="absolute left-0 top-0 bottom-0 w-px"
        style={{ background: `linear-gradient(to bottom, ${color}, transparent)` }}
      />
      {/* Timeline dot */}
      <div
        className="absolute left-0 top-1 w-3 h-3 rounded-full -translate-x-1/2"
        style={{ background: color, boxShadow: `0 0 12px ${color}` }}
      />

      <div
        className="card-glow rounded-2xl p-6"
        style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${color}22` }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-xl font-black text-white">{company}</h3>
            <p className="font-semibold" style={{ color }}>{role}</p>
          </div>
          <div className="text-right text-sm text-slate-500">
            <div>{period}</div>
            <div>{location}</div>
          </div>
        </div>

        <ul className="space-y-2 mb-5">
          {highlights.map((h, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-400 leading-relaxed">
              <span style={{ color }} className="mt-1 shrink-0">▸</span>
              {h}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          {tech.map((t) => (
            <span
              key={t}
              className="px-2.5 py-1 rounded-md text-xs font-medium"
              style={{ background: `${color}15`, color, border: `1px solid ${color}33` }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export default function Experience() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  return (
    <section id="experience" className="relative py-24 px-6" style={{ zIndex: 1 }}>
      <div className="max-w-4xl mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-1 rounded-full text-xs font-semibold tracking-widest uppercase mb-4"
            style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' }}>
            Career
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            Work <span className="gradient-text">Experience</span>
          </h2>
          <p className="text-slate-500">20+ years across Australia, Brazil, and international projects.</p>
        </motion.div>

        <div className="ml-4">
          {experience.map((exp, i) => (
            <ExperienceCard key={exp.company + exp.period} {...exp} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

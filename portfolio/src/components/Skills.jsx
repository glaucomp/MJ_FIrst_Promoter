import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { skills } from '../data/portfolio';

function SkillCard({ category, items, color, index }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="card-glow rounded-2xl p-6"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${color}33`,
      }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-3 h-3 rounded-full"
          style={{ background: color, boxShadow: `0 0 10px ${color}` }}
        />
        <h3 className="font-bold text-white text-lg">{category}</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <motion.span
            key={item}
            whileHover={{ scale: 1.08, y: -2 }}
            className="px-3 py-1 rounded-full text-xs font-medium cursor-default"
            style={{
              background: `${color}18`,
              color,
              border: `1px solid ${color}44`,
            }}
          >
            {item}
          </motion.span>
        ))}
      </div>
    </motion.div>
  );
}

export default function Skills() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  return (
    <section id="skills" className="relative py-24 px-6" style={{ zIndex: 1 }}>
      <div className="max-w-6xl mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-1 rounded-full text-xs font-semibold tracking-widest uppercase mb-4"
            style={{ background: 'rgba(6,182,212,0.1)', color: '#22d3ee', border: '1px solid rgba(6,182,212,0.3)' }}>
            Tech Stack
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            Skills & <span className="gradient-text">Expertise</span>
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto">
            A full-stack arsenal built over 20+ years across web, mobile, cloud, and AI.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {skills.map((skill, i) => (
            <SkillCard key={skill.category} {...skill} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

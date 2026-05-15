import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { education } from '../data/portfolio';

export default function Education() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  return (
    <section id="education" className="relative py-24 px-6" style={{ zIndex: 1 }}>
      <div className="max-w-4xl mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-1 rounded-full text-xs font-semibold tracking-widest uppercase mb-4"
            style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}>
            Education
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            Academic <span className="gradient-text">Background</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {education.map((edu, i) => (
            <motion.div
              key={edu.institution}
              initial={{ opacity: 0, y: 40 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.15 }}
              className="card-glow rounded-2xl p-6"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(16,185,129,0.2)' }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 text-xl"
                style={{ background: 'rgba(16,185,129,0.15)' }}>
                🎓
              </div>
              <h3 className="font-bold text-white text-lg mb-1">{edu.degree}</h3>
              <p className="text-slate-400 text-sm mb-2">{edu.institution}</p>
              <span className="px-3 py-1 rounded-full text-xs font-medium"
                style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}>
                {edu.period}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

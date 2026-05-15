import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { personal } from '../data/portfolio';

export default function Contact() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  return (
    <section id="contact" className="relative py-24 px-6" style={{ zIndex: 1 }}>
      <div className="max-w-2xl mx-auto text-center">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <span className="inline-block px-4 py-1 rounded-full text-xs font-semibold tracking-widest uppercase mb-6"
            style={{ background: 'rgba(244,63,94,0.1)', color: '#fb7185', border: '1px solid rgba(244,63,94,0.3)' }}>
            Let's Talk
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-6">
            Get in <span className="gradient-text">Touch</span>
          </h2>
          <p className="text-slate-400 text-lg mb-10 leading-relaxed">
            Open to Senior Full-Stack Engineer roles. If you're building something great
            and need a hands-on engineer who can own the full stack, let's connect.
          </p>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="rounded-2xl p-8 mb-8"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(124,58,237,0.2)' }}
          >
            <div className="flex flex-col gap-4">
              <a
                href={`mailto:${personal.email}`}
                className="flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-semibold text-white transition-all duration-300 hover:scale-105 hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)' }}
              >
                <span>✉</span>
                {personal.email}
              </a>
              <a
                href={personal.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-semibold text-white transition-all duration-300 hover:scale-105"
                style={{ border: '1px solid rgba(124,58,237,0.4)', background: 'rgba(124,58,237,0.1)' }}
              >
                <span>🔗</span>
                LinkedIn Profile
              </a>
            </div>
          </motion.div>

          <p className="text-slate-600 text-sm">
            Based in Brisbane, Queensland, Australia · Open to remote & hybrid
          </p>
        </motion.div>
      </div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="text-center mt-20 pt-8"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <p className="text-slate-600 text-sm">
          © 2024 Glauco Pereira · Built with React + Vite + Tailwind
        </p>
      </motion.div>
    </section>
  );
}

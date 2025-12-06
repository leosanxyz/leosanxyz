"use client";
import React from 'react';

interface AboutMeProps {
    darkMode: boolean;
}

const AboutMe: React.FC<AboutMeProps> = ({ darkMode }) => {
    const textColor = darkMode ? '#eee' : '#111';
    const subTextColor = darkMode ? '#bbb' : '#555';
    const accentColor = darkMode ? '#f59e42' : '#d97706';

    return (
        <div style={{
            maxWidth: '600px',
            margin: '0 auto',
            paddingTop: '2rem',
        }}>
            {/* Header with avatar placeholder */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginBottom: '3rem'
            }}>
                <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    border: `2px solid ${darkMode ? '#555' : '#ddd'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '1.5rem',
                    backgroundColor: darkMode ? '#333' : '#fff',
                }}>
                    {/* Simple brain/thought icon */}
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={darkMode ? '#eee' : '#333'} strokeWidth="1.5">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                        <circle cx="9" cy="9" r="1" fill={darkMode ? '#eee' : '#333'} />
                        <circle cx="15" cy="9" r="1" fill={darkMode ? '#eee' : '#333'} />
                    </svg>
                </div>

                <h1 style={{
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    color: textColor,
                    textAlign: 'center',
                    margin: 0,
                }}>
                    Quiero crear cosas increíbles.
                </h1>
            </div>

            {/* Main content - text blocks */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                textAlign: 'left',
            }}>
                <p style={{
                    fontSize: '1.1rem',
                    lineHeight: '1.6',
                    color: subTextColor,
                    margin: 0,
                }}>
                    Cosas que conecten con las personas. Cosas que se vean, se sientan, y funcionen pensando en ellos. <span style={{ color: textColor, fontWeight: 500 }}>Simples pero sofisticadas.</span>
                </p>

                <p style={{
                    fontSize: '1rem',
                    lineHeight: '1.6',
                    color: subTextColor,
                    margin: 0,
                }}>
                    Desde pequeño supe que mi vida estaría para siempre ligada a la tecnología y me dedicaría a descubrir qué tan lejos se podía llegar al usarla. Conforme fui creciendo descubrí que la tecnología tiene que ir de la mano con un gran diseño para llegar a la excelencia.
                </p>

                <blockquote style={{
                    margin: '1rem 0',
                    paddingLeft: '1rem',
                    borderLeft: `3px solid ${darkMode ? '#555' : '#ddd'}`,
                    fontStyle: 'italic',
                    color: subTextColor,
                    fontSize: '1.1rem',
                }}>
                    “El diseño no es solo como se ve y se siente. El diseño es como funciona” — Steve Jobs
                </blockquote>

                <p style={{
                    fontSize: '1rem',
                    lineHeight: '1.6',
                    color: subTextColor,
                    margin: 0,
                }}>
                    Estudié ingeniería en tecnología de software en la Universidad Autónoma de Nuevo León, para luego cambiar a estudiar diseño y producción de videojuegos, en donde me sumergí completamente en la multidisciplinidad multimedia.
                </p>

                <p style={{
                    fontSize: '1rem',
                    lineHeight: '1.6',
                    color: subTextColor,
                    margin: 0,
                }}>
                    Actualmente trabajo en <strong>Vidanta</strong>, un conglomerado de los resorts más grandes de México, dedicándome a la creación de contenido e innovación mediante inteligencia artificial.
                </p>

                <p style={{
                    fontSize: '1.1rem',
                    lineHeight: '1.6',
                    color: textColor,
                    fontWeight: 500,
                    margin: 0,
                    marginTop: '0.5rem',
                }}>
                    Quiero seguir creando grandes cosas. Me importa el progreso tecnológico y quiero mejorar lo existente. Estoy bastante seguro de que siempre será así.
                </p>

                {/* Social Media Text Links */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    marginTop: '3rem',
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '1.5rem',
                        flexWrap: 'wrap',
                    }}>
                        {[
                            { href: "https://www.linkedin.com/in/leosanxyz/", label: "linkedin" },
                            { href: "https://www.instagram.com/leosanxyz/", label: "instagram" },
                            { href: "https://x.com/leosanxyz", label: "twitter" },
                        ].map((item, i) => (
                            <a
                                key={i}
                                href={item.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    fontSize: '1.1rem',
                                    color: textColor,
                                    textDecoration: 'none',
                                    fontWeight: 500,
                                    opacity: 0.8,
                                    transition: 'opacity 0.2s',
                                    borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`,
                                    paddingBottom: '2px',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                            >
                                {item.label}
                            </a>
                        ))}
                    </div>

                    <a
                        href="mailto:leonsanchez09@protonmail.com"
                        style={{
                            fontSize: '1.1rem',
                            color: subTextColor,
                            textDecoration: 'none',
                            textAlign: 'center',
                            opacity: 0.7,
                            transition: 'color 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = textColor}
                        onMouseLeave={(e) => e.currentTarget.style.color = subTextColor}
                    >
                        leonsanchez09@protonmail.com
                    </a>
                </div>
            </div>


        </div>
    );
};

export default AboutMe;

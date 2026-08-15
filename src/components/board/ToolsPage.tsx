import React from 'react';
import { Calculator, PieChart, Scissors, Wrench } from 'lucide-react';
import { useLang } from '../../contexts/LanguageContext';
import Header from '../layout/Header';
import {
  COST_CALCULATOR_URL,
  TEMPLATE_MAKER_URL,
} from '../../utils/tools';

interface ToolsPageProps {
  onNavigate?: (page: string) => void;
}

const ToolsPage: React.FC<ToolsPageProps> = ({ onNavigate }) => {
  const { tr } = useLang();

  const tools: {
    id: string;
    title: string;
    desc: string;
    href?: string;
    page?: string;
    icon: React.ReactNode;
    color: string;
  }[] = [
    {
      id: 'cost',
      title: tr.toolCostCalculator,
      desc: tr.toolCostCalculatorDesc,
      href: COST_CALCULATOR_URL,
      icon: <Calculator size={28} color="#fff" />,
      color: '#1e3a5f',
    },
    {
      id: 'revenue-split',
      title: tr.toolRevenueSplit,
      desc: tr.toolRevenueSplitDesc,
      page: 'revenue-split',
      icon: <PieChart size={28} color="#fff" />,
      color: '#007aff',
    },
    {
      id: 'templates',
      title: tr.toolTemplateMaker,
      desc: tr.toolTemplateMakerDesc,
      href: TEMPLATE_MAKER_URL,
      icon: <Scissors size={28} color="#fff" />,
      color: '#5BA3D9',
    },
  ];

  return (
    <div className="page">
      <Header title={tr.tools} icon={<Wrench size={20} />} />
      <div className="page-content">
        <div className="tools-cards-grid">
          {tools.map((tool) =>
            tool.page ? (
              <button
                key={tool.id}
                type="button"
                className="tools-card tools-card-btn"
                onClick={() => onNavigate?.(tool.page!)}
              >
                <div className="tools-card-icon" style={{ background: tool.color }}>
                  {tool.icon}
                </div>
                <div className="tools-card-body">
                  <h3>{tool.title}</h3>
                  <p>{tool.desc}</p>
                </div>
              </button>
            ) : (
              <a
                key={tool.id}
                className="tools-card"
                href={tool.href}
                target="_blank"
                rel="noreferrer"
              >
                <div className="tools-card-icon" style={{ background: tool.color }}>
                  {tool.icon}
                </div>
                <div className="tools-card-body">
                  <h3>{tool.title}</h3>
                  <p>{tool.desc}</p>
                </div>
              </a>
            ),
          )}
        </div>
      </div>
    </div>
  );
};

export default ToolsPage;

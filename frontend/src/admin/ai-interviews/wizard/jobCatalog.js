// Default suggestions for the interview's Job name and Job role dropdowns. Admins can still type any other
// name; those are saved per tenant (resource kinds "jobNames" / "jobRoles") and listed after these.
const list = (text) => text.trim().split("\n").map((line) => line.trim()).filter(Boolean);

export const JOB_NAMES = Object.freeze(list(`
Frontend Developer
Backend Developer
Full Stack Developer
Android Developer
iOS Developer
Cross-Platform Mobile Developer
Desktop Application Developer
Game Developer
AR/VR Developer
Embedded Software Engineer
Firmware Engineer
Systems Software Engineer
Blockchain Developer
Smart Contract Developer
Salesforce Developer
SAP ABAP Developer
ServiceNow Developer
ERP Developer
RPA Developer
API Integration Engineer
Low-Code Developer
WordPress Developer
Shopify Developer
Software Architect
Solutions Architect
Enterprise Architect
Technical Lead
Software Engineering Manager
Manual QA Tester
QA Automation Engineer
Software Development Engineer in Test
Performance Test Engineer
Mobile Application Tester
Game QA Tester
Accessibility Tester
DevOps Engineer
Site Reliability Engineer
Cloud Engineer
Cloud Architect
Platform Engineer
Build and Release Engineer
Network Engineer
Network Administrator
Systems Administrator
Linux Administrator
Database Administrator
Database Developer
IT Support Engineer
IT Service Desk Analyst
Application Support Engineer
IT Infrastructure Manager
IT Service Delivery Manager
Cybersecurity Analyst
Security Operations Center Analyst
Penetration Tester
Application Security Engineer
Cloud Security Engineer
Network Security Engineer
Security Architect
Digital Forensics Analyst
Incident Response Analyst
Threat Intelligence Analyst
Identity and Access Management Engineer
Information Security Auditor
Governance, Risk and Compliance Analyst
Data Analyst
Business Intelligence Analyst
Business Intelligence Developer
Data Engineer
Analytics Engineer
Data Scientist
Machine Learning Engineer
AI Research Scientist
Generative AI Engineer
Natural Language Processing Engineer
Computer Vision Engineer
MLOps Engineer
Data Architect
Data Quality Analyst
Data Governance Analyst
Statistician
Operations Research Analyst
GIS Analyst
Geospatial Engineer
Robotics Engineer
IoT Engineer
Electronics Design Engineer
VLSI Design Engineer
Semiconductor Verification Engineer
FPGA Engineer
Telecommunications Engineer
Electrical Design Engineer
Power Systems Engineer
Control Systems Engineer
Mechanical Design Engineer
CAD Engineer
CAE Engineer
Automotive Engineer
Aerospace Engineer
Mechatronics Engineer
Civil Design Engineer
Structural Engineer
Transportation Engineer
Environmental Engineer
Chemical Process Engineer
Materials Engineer
Biomedical Engineer
Industrial Engineer
Manufacturing Engineer
Quality Assurance Engineer
Reliability Engineer
Renewable Energy Engineer
Instrumentation Engineer
Research and Development Engineer
Packaging Engineer
Product Manager
Technical Product Manager
Product Owner
Project Manager
Technical Program Manager
Program Manager
Scrum Master
Agile Coach
Business Analyst
Systems Analyst
Product Analyst
Business Operations Analyst
Strategy Analyst
Management Consultant
Business Process Analyst
Operations Manager
Business Development Executive
Business Development Manager
Partnerships Manager
Customer Success Manager
Customer Support Executive
Customer Experience Analyst
Implementation Consultant
Change Management Consultant
Service Delivery Manager
UI Designer
UX Designer
Product Designer
UX Researcher
Interaction Designer
UX Writer
Graphic Designer
Motion Graphics Designer
Brand Designer
Industrial Designer
Human Resources Executive
HR Generalist
HR Business Partner
Talent Acquisition Specialist
Technical Recruiter
Recruitment Coordinator
Learning and Development Specialist
Corporate Trainer
Compensation and Benefits Analyst
Payroll Specialist
Employee Relations Specialist
People Operations Manager
HR Analytics Specialist
Organizational Development Consultant
Workforce Planning Analyst
Administrative Executive
Office Manager
Executive Assistant
Virtual Assistant
Document Controller
Accountant
Chartered Accountant
Cost Accountant
Management Accountant
Accounts Payable Specialist
Accounts Receivable Specialist
Tax Consultant
Tax Analyst
Internal Auditor
External Auditor
Financial Analyst
Financial Planning and Analysis Analyst
Investment Banking Analyst
Equity Research Analyst
Credit Analyst
Risk Analyst
Treasury Analyst
Financial Controller
Finance Manager
Budget Analyst
Actuarial Analyst
Insurance Underwriter
Insurance Claims Analyst
Banking Relationship Manager
Loan Officer
Wealth Manager
Investment Analyst
Fraud Analyst
Anti-Money Laundering Analyst
KYC Analyst
Sales Executive
Inside Sales Representative
Sales Development Representative
Account Executive
Key Account Manager
Sales Manager
Sales Operations Analyst
Pre-Sales Consultant
Sales Engineer
Channel Sales Manager
Digital Marketing Executive
Performance Marketing Specialist
SEO Specialist
Search Engine Marketing Specialist
Social Media Manager
Content Marketing Manager
Email Marketing Specialist
Marketing Automation Specialist
Product Marketing Manager
Brand Manager
Market Research Analyst
Consumer Insights Analyst
Public Relations Executive
Corporate Communications Specialist
Event Manager
Content Writer
Copywriter
Technical Writer
Editor
Journalist
Video Editor
Instructional Designer
E-Learning Developer
Academic Counselor
Admissions Counselor
School Teacher
College Lecturer
Research Associate
Clinical Research Coordinator
Medical Writer
Pharmacovigilance Associate
Healthcare Administrator
Legal Associate
Corporate Legal Counsel
Paralegal
Compliance Officer
Procurement Specialist
Supply Chain Analyst
Logistics Coordinator
Demand Planner
`));

export const JOB_ROLES = Object.freeze(list(`
React Developer
Angular Developer
Vue.js Developer
Next.js Developer
JavaScript Developer
TypeScript Developer
HTML/CSS Developer
Node.js Developer
Express.js Developer
Python Developer
Django Developer
FastAPI Developer
Flask Developer
Java Developer
Spring Boot Developer
C# Developer
ASP.NET Developer
PHP Developer
Laravel Developer
Ruby on Rails Developer
Go Developer
Rust Developer
C++ Developer
MERN Stack Developer
MEAN Stack Developer
Java Full Stack Developer
Python Full Stack Developer
.NET Full Stack Developer
Flutter Developer
React Native Developer
Kotlin Android Developer
Swift iOS Developer
Unity Developer
Unreal Engine Developer
Embedded C Developer
Functional Test Engineer
Selenium Automation Engineer
Playwright Automation Engineer
Cypress Automation Engineer
API Test Engineer
Performance Test Engineer
Mobile Test Automation Engineer
Security Test Engineer
AWS Cloud Engineer
Azure Cloud Engineer
Google Cloud Engineer
Kubernetes Engineer
DevOps Engineer
Site Reliability Engineer
Cloud Migration Engineer
Windows Systems Administrator
Linux Systems Administrator
Network Support Engineer
Network Security Engineer
Database Administrator
IT Help Desk Analyst
Technical Support Specialist
Application Support Analyst
SOC Analyst
Vulnerability Assessment Analyst
Penetration Tester
Malware Analyst
Digital Forensics Investigator
Identity and Access Management Analyst
Cybersecurity Compliance Analyst
SQL Developer
Power BI Developer
Tableau Developer
Data Analyst
Business Intelligence Analyst
Data Engineer
ETL Developer
Data Warehouse Engineer
Big Data Engineer
Data Scientist
Machine Learning Engineer
Deep Learning Engineer
NLP Engineer
Computer Vision Engineer
Generative AI Engineer
MLOps Engineer
AI Research Engineer
Data Annotation Specialist
Data Quality Analyst
UI Designer
UX Designer
UX Researcher
Interaction Designer
Design Systems Designer
UX Writer
PCB Design Engineer
Analog Design Engineer
Digital Design Engineer
ASIC Design Engineer
FPGA Design Engineer
VLSI Verification Engineer
Embedded Systems Engineer
Robotics Software Engineer
Industrial Automation Engineer
PLC Programmer
Mechanical Design Engineer
Automotive Design Engineer
Thermal Engineer
Structural Design Engineer
Civil Planning Engineer
Construction Project Engineer
Electrical Design Engineer
Power Electronics Engineer
Solar Design Engineer
Environmental Engineer
Associate Product Manager
Technical Product Manager
AI Product Manager
SaaS Product Manager
Product Operations Manager
Product Owner
IT Project Manager
Project Coordinator
Program Manager
Scrum Master
Agile Coach
Business Analyst
Business Systems Analyst
Business Process Consultant
Strategy Consultant
Operations Analyst
Operations Manager
Business Development Associate
Strategic Partnerships Manager
Customer Success Associate
Customer Success Manager
Customer Onboarding Specialist
Implementation Specialist
Customer Support Representative
Customer Experience Manager
HR Executive
HR Generalist
HR Business Partner
Talent Acquisition Specialist
Technical Recruiter
Campus Recruiter
Recruitment Coordinator
Employee Engagement Specialist
Employee Relations Specialist
Learning and Development Specialist
Corporate Trainer
Compensation Analyst
Benefits Administrator
Payroll Executive
HR Operations Specialist
People Analytics Analyst
Administrative Coordinator
Executive Assistant
Office Administrator
Records Management Specialist
Junior Accountant
General Ledger Accountant
Accounts Payable Executive
Accounts Receivable Executive
Cost Accountant
Tax Accountant
GST Executive
Financial Reporting Analyst
Financial Planning Analyst
Budget Analyst
Treasury Analyst
Credit Analyst
Investment Banking Analyst
Equity Research Associate
Investment Research Analyst
Portfolio Analyst
Financial Risk Analyst
Internal Audit Associate
External Audit Associate
Forensic Accountant
Insurance Underwriter
Claims Processing Specialist
Actuarial Analyst
Banking Operations Executive
Banking Relationship Manager
Sales Development Representative
Business Development Representative
Inside Sales Executive
Field Sales Executive
Enterprise Account Executive
Key Account Manager
Territory Sales Manager
Regional Sales Manager
Channel Sales Executive
Partner Account Manager
Sales Operations Analyst
Revenue Operations Analyst
Pre-Sales Consultant
Technical Sales Engineer
Retail Sales Associate
E-Commerce Executive
Marketplace Account Manager
Digital Marketing Executive
SEO Executive
Technical SEO Specialist
PPC Specialist
Paid Social Media Specialist
Social Media Executive
Community Manager
Influencer Marketing Executive
Affiliate Marketing Manager
Email Marketing Executive
CRM Marketing Specialist
Marketing Automation Specialist
Growth Marketing Manager
Product Marketing Specialist
Brand Strategist
Market Research Executive
Consumer Insights Analyst
Public Relations Executive
Corporate Communications Executive
Content Strategist
Content Writer
Advertising Copywriter
Technical Writer
Proposal Writer
Grant Writer
Copy Editor
Proofreader
Scriptwriter
Graphic Designer
Motion Graphics Artist
Video Editor
3D Artist
Animator
Legal Associate
Contract Analyst
Compliance Analyst
Intellectual Property Analyst
Company Secretary
School Teacher
Assistant Professor
Academic Counselor
Instructional Designer
E-Learning Content Developer
Research Assistant
Clinical Research Associate
Clinical Data Manager
Medical Coding Specialist
Pharmacovigilance Associate
Procurement Executive
Supply Chain Analyst
Inventory Analyst
Logistics Executive
Demand Planning Analyst
`));

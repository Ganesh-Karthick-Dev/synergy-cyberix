import QuickFingerprintScan from './QuickFingerprintScan'
import DnsResolutionScan from './DnsResolutionScan'
import SslTlsAnalysisScan from './SslTlsAnalysisScan'
import SecurityHeadersScan from './SecurityHeadersScan'
import CmsDetectionScan from './CmsDetectionScan'
import SubdomainEnumerationScan from './SubdomainEnumerationScan'
import PortScanningScan from './PortScanningScan'
import SqlInjectionTestScan from './SqlInjectionTestScan'
import XssTestScan from './XssTestScan'
import CsrfTestScan from './CsrfTestScan'
import WafDetectionScan from './WafDetectionScan'
import FileUploadCheckScan from './FileUploadCheckScan'
import CtLogSubdomainDiscoveryScan from './CtLogSubdomainDiscoveryScan'
import HttpMethodsCheckScan from './HttpMethodsCheckScan'
import HostHeaderInjectionScan from './HostHeaderInjectionScan'
import CorsPolicyValidationScan from './CorsPolicyValidationScan'
import OpenRedirectCheckScan from './OpenRedirectCheckScan'

export const scanComponents = {
  'quick-fingerprint': QuickFingerprintScan,
  'dns-resolution': DnsResolutionScan,
  'ssl-tls-analysis': SslTlsAnalysisScan,
  'security-headers': SecurityHeadersScan,
  'cms-detection': CmsDetectionScan,
  'subdomain-enumeration': SubdomainEnumerationScan,
  'port-scanning': PortScanningScan,
  'sql-injection-test': SqlInjectionTestScan,
  'xss-test': XssTestScan,
  'csrf-test': CsrfTestScan,
  'waf-detection': WafDetectionScan,
  'file-upload-check': FileUploadCheckScan,
  'ct-log-subdomain-discovery': CtLogSubdomainDiscoveryScan,
  'http-methods-check': HttpMethodsCheckScan,
  'host-header-injection': HostHeaderInjectionScan,
  'cors-policy-validation': CorsPolicyValidationScan,
  'open-redirect-check': OpenRedirectCheckScan
}

export {
  QuickFingerprintScan,
  DnsResolutionScan,
  SslTlsAnalysisScan,
  SecurityHeadersScan,
  CmsDetectionScan,
  SubdomainEnumerationScan,
  PortScanningScan,
  SqlInjectionTestScan,
  XssTestScan,
  CsrfTestScan,
  WafDetectionScan,
  FileUploadCheckScan,
  CtLogSubdomainDiscoveryScan,
  HttpMethodsCheckScan,
  HostHeaderInjectionScan,
  CorsPolicyValidationScan,
  OpenRedirectCheckScan
}


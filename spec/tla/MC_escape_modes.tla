---------------------------- MODULE MC_escape_modes ----------------------------
(* Liveness: from every state the implementation reached (model "modes"), a pilot who keeps tapping STEP, waits,   *)
(* unplugs the USB drive and powers on always gets back to the scan (AUTO or MANUAL).                         *)
EXTENDS EDMCore, ImplGraph_modes

MCAlarmPri == <<>>
MCItems == <<"FUEL", "RATE", "OATU", "EGT1", "HPQ", "KF", "ACCUM", "GPSC", "DUMP", "END">>
MCInputs == {"StepTap", "LfTap", "BothTap", "StepHold5", "LfHold3", "BothHold5", "Timer", "TwoMin", "PowerOn", "PowerOnStep", "PowerOff", "UsbIn", "UsbOut", "Rise", "PeakFirst", "PeakAll", "Record", "OffEnds", "SnapEnds"}
MCFF == TRUE

EscapeInit == st \in {ImplState[i] : i \in ImplExplored}
EscapeSpec == EscapeInit /\ [][PilotNext]_st /\ WF_st(PilotNext)
=============================================================================
